# Design vet: RECOVERY-DESIGN-20261017 (process-loss recovery of bound creations)

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` (untracked draft) in
`/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016` at `381750de2`
(`src/` and `test/` clean; the only other change is the closeout plan). Every `file:line` below
was re-read from that tree, not taken from the draft. Read-only: nothing in any worktree was
touched; no lab host used. Verifier: Fable (independent).

Sealed bar applied (quest.json `verificationTemplates`): owner-interaction, admission-gating,
concurrency-serialization, recovery-replay, transport-delivery, harness-fidelity,
formation-circularity; plus the design-note template (sections 1-4) that structures the draft.
Out-of-bar templates consulted once where the draft's mechanism is a re-drive: retry-loops.

Reading bound and what I withheld. Read in full: CLAUDE.md, rules.md, router.md,
authority-and-recovery.md, CONTRACT-R2.md, HANDOFF-INTERFACES.md, TEST-PLAN.md, both prior
design notes (1265 + 1128 lines, every revision), the stage-1c and process-custody acceptances,
vets A/B and re-vet R2, the activation charter lines 55-100, and these sources in full:
service-lifecycle-recovery.js, service-lifecycle-manager.js, service-consensus-creation-intent.js,
service-consensus-bootstrap.js, service-lifecycle-operations.js,
runtime-service-bound-creation-route.js, runtime-service-handler.js (+ constants),
wasm-creation-opening.js, wasm-service-serving-state.js, wasm-service-replica-lifecycle.js,
wasm-service-lifecycle.js, wasm-creation-reconciliation.js, wasm-creation-publication.js,
wasm-creation-wake.js, wasm-creation-genesis.js, wasm-creation-retirement.js,
service-runtime-consensus-bootstrap.js, service-runtime-consensus-publication.js,
wasm-component-driver-consensus.js, runtime-endpoint-publication-wiring.js,
query/runtime-replica-state-projection.js, data-directory-process-owner.js,
entrypoint-startup-acquisition-ledger.js, startup-service-lifecycle-owner.js,
executor-outcome-constants.js, the embedding fixture and its test, the origin fixture, the
SQLite creation fixture, and the nine verification templates. Read by excerpt (grep/sed):
wasm-service-replica.js (serving/leader/shutdown), wasm-service-consensus-port.js
(openWasmServiceDatabase), service-instance-state.js (allowed-from table),
service-instance-metadata.js (readState, mutateResource), operation-lifecycle.js
(transitionOperation, list SQL), endpoint-incarnation-authority.js (header, outcome names),
raft-rs-durable-store.js (durability header), runtime-startup-wiring.js,
runtime-service-handler-setup.js, replica-lifecycle-durable-generation.test.js (spawn block),
wasm-creation-publication.integration.test.js (P6a/P6b by grep). WITHHELD (not read; findings
below do not depend on them): test/node/runtime-service-bound-route.test.js,
test/wasm-service/wasm-creation-local-record.test.js, the three activation-discovery vet
reports (~1,370 lines, not named by the brief), HANDOVER-20261017.md, log.ndjson,
wasm-component-driver.js (main), service-runtime-lifecycle*.js (`_removeEndpoint`,
`_projectReplicaState` bodies), owner-key-reconcile-queue.js, timer-manager.js,
raft-rs-runtime-owner.js. About 9,500 lines of records and 6,500 lines of source read;
about 4,500 lines withheld.

## Verdict: REVISE (blocking B1-B4; required R1-R16; recorded N1-N9)

What the draft gets right, and I checked it: one restart scan with no metadata read at scan
time (today's scan does read metadata and may even reserve on a PENDING row of ANOTHER node:
`recoverConsensusCreationRow :270-274` -> `recoverConsensusCreation` -> `continueIntent :175-186`
over an unfiltered `_readRecoverableOperations :521-543`); re-entry under the creation's own id
through the existing route (`scheduleBoundReentry :141-149`); the RETIRED re-drive is sound as
described because `retireWasmCreation` already keys by creation, tombstones by path with the
derived five fields (`tombstoneByPath :77-87`), accepts ALREADY/CLOSED idempotently
(`RESOURCE_PHASE_FROM :256-259`, CLOSED monotonic `:277`) and re-derives the wake from every
CLOSED answer (`closeRetired :128-137`); the creation row completing at CLOSED closes A-B6
honestly; the memo rebuilt before `ready` closes N6; the B1 safety argument (J granted only after
every I slot is CLOSED; CLOSED on I's node only after the local tombstone or the typed absence
of the file) holds for the realistic crash points. Everything below is where the draft's
mechanism is unowned, where its text contradicts the implemented and accepted order, where its
typed refusals do not survive to the boundary it claims them at, and where its proof plan
cannot be green as written.

---

## Section 1. Contract conformance (CONTRACT-R2 B1/B4, HANDOFF recovery clauses)

| Clause | Draft decision | Verdict | Evidence |
| --- | --- | --- | --- |
| B1 :156-159 "intact retained voter with a recorded PUBLISHED local grant may restart ... without a live metadata quorum" | D-R4 GRANT_UNCONFIRMED | PARTLY: the serving half is designed; the "without a live metadata quorum" half is true only in this embedding. The inventory (D-R2) and the re-entry both need the creation JOURNAL (`readJournal :67-72` via `_idempotencyReader`/`_recoveryReader`; `claimConsensusCreationOpening :299-333` reads the journal inside the open). In the embedding the journal is a component SQLite reachable while the metadata owner is faulted through a different seam (`service-consensus-creation-fixture.js:56-65` setReadFault vs `service-instance-creation-sqlite-fixture.js:166-170` setGatewayReadFault). In production the journal is `wasm_operations`, a replicated system table read through the same routed gateway (RV1.5, charter item 13). A real quorum loss takes the inventory down before D-R4 is ever reached. | R1 |
| B1 :159-161 "If I had been selected for retirement while offline, its outstanding grant still holds J. Reconciliation later closes I." | D-R4 "RELEASING or CLOSED -> retireReplica by token (R8)" | NOT ANSWERED: no owner performs that retirement. A re-entry whose grant answers RESOURCE_CLOSED returns HELD (`publishWasmCreation :77` -> `boundStartResult :110-115`), the replica keeps serving, nothing retires. Before the adapter, `resolveRetainedAdmission :171` answers RESOURCE_CLOSED and the handler writes a permanent FAILED memo (`RESUME_OUTCOME :43-44`, `settleCreation :125`); the file is tombstoned only by the next REMOVE (as stage-1 P6b already states). What closes I in this scenario is a REMOVE dispatch, not a re-confirmation. | B1 |
| B1 :161-163 "Once J is allowed to serve, I's prior local RETIRED record must already exist" | D-R4 "why B1 is safe" | HOLDS, with one premise the draft omits: D2' allows CLOSED on `CREATION_STORAGE_MISSING` (`RETIRED_LOCALLY :25-26` includes it), so "I's RETIRED exists" is really "I's tombstone exists OR I's file was absent on I's node at retirement"; the copied/reappearing-file case is refused by the `storage` inode field at open (`wasmCreationLocalIdentity :199-200`, `openWasmCreationRecords :289`). State the premise exactly. | N1 |
| B1 :164-165 "Prior ADMITTED-only local state permits bootstrap recovery but no protected serving until the grant is resolved" | D-R3/D-R4 ADMITTED -> HELD re-entry | CONFORMS (`openServingState :54-58` HELD; D1' re-grant). | - |
| B4 :167 "No local tombstone/root is inferred after storage loss" | D-R11, D-R9 | CONFORMS in the opening/retirement owners (`tombstoneOn :151-156` never writes on null/mismatch). | - |
| B4 :169-170 "Known wipe, contradictory file, missing original binding, and read unavailability remain distinct typed refusals" | D-R11 "four distinct" | FAILS at the boundary the claim is made for (claim item 6, handler outcomes): every open refusal is collapsed three times on its way up: `startReplica :378-381` keeps only `cause.code || CONSENSUS_START_REFUSED` (a `ServiceInstanceContractError` has `.outcome`, no `.code`: `service-instance-contract.js:16-20`), `projectBoundStart :58` turns it into `startFailure(startResult.error)`, and `confirmConsensusBootstrapResult :60-66` throws one code, `CONSENSUS_SERVING_NOT_IMPLEMENTED`, which `continueRetainedCreation :160-166` returns as `UNKNOWN{reason}` and the handler maps to a DEFERRAL (`RESUME_OUTCOME :44`, RV3.3 row for UNKNOWN). STORAGE_MISSING, CORRUPT_STATE, CONTENT_CONFLICT and UNAVAILABLE are one re-enterable deferral at the handler. | B3 |
| B4 :168-169 "Copy/image admission cannot import source-local permission, even if all application tables match" | section 5 identity; 7 F-R1 "storage compared when present, never required" | WEAKENED for the restart path: a copied file passes the inventory's five-field `identityMatches` (classified PUBLISHED), the open then refuses CONTENT_CONFLICT on `storage`, and that refusal is the deferral above, so a copied file becomes an endless re-drive instead of the permanent typed refusal B4 names. | B3, R4 |
| Custody :173-183 "failed startup cleanup ... withholds that release"; "owned recovery is explicit process termination followed by ordinary retained restart" | D-R10 "a failed startup cleanup keeps the lock and the inventory is not applied" | STATED, NOT PROVEN: the embedding acquires the owner directly (`fixture :205` `acquireDataDirectoryProcessOwner`), never through `runStartupWithCleanup`/the ledger (`entrypoint-startup-acquisition-ledger.js:45-74`); no P exercises "inventory under a lock another process holds" or "cleanup failure withholds the inventory". | R13 |
| :142-143 "Startup scans the same outstanding records. No new timer or daemon is introduced." | D-R2 one scan | CONFORMS (no timer added). Ambiguity: the draft leaves both `recoverPendingOperations` (generic rows) and the new `inventoryRetainedCreations()` as entry points over the same rows; say which single call the embedding and the charter's item 13 make, and what the other returns for consensus rows. | R14 |
| :194-195 "Recovery resolving today's different definition refuses; it cannot substitute it" (C7) | not named | CONFORMS BY CONSTRUCTION, uncited: the restart re-entry decodes `intent_json` (`journaledIntent :207-220`, `captureIntent :42-59` INVALID_LINEAGE against the retained binding) and never reads the `service_definitions` row on the retained path (`routeRuntimeServiceCreate :178-183`; the row is classified only on the UNROUTED path `:186`). Name it in section 5 and cite the C7 witness. | N2 |
| HANDOFF :35-43 "a historical COMPLETED row still requires current resource permission before any new effect" | D-R6 COMPLETED = retired | CONFORMS vacuously (a COMPLETED row has no new effect: `continueIntent :178`, `retainedRowAnswer :261` TERMINAL). The HANDOFF sentence was written for COMPLETED = published; the draft records the supersession (R09) correctly. Add: a bound creation row is never FAILED today (`continueRetainedCreation :160-166` never writes FAILED), so D-R6's `REMOVE_FAILED` branch is typed for an unreachable state; say so. | N3 |
| HANDOFF :26-27 "A lost reservation response is resolved with the same request" | D-R8 | CONFORMS for F3; the wording "no new allocation" is wrong for a truly PENDING row (the restart re-entry's `reserveAndRetain :138-159` IS the first allocation). See D-R8 below. | R10 |
| HANDOFF :99-100 "A retained restart consumes the original journal and local grant; ordinary semantic stop is not a crash-recovery seam" | D-R1 | CONFORMS (`shutdownAll :735-750` is ORDERLY_STOP, no tombstone: `tombstoneRetiringReplica :235-238`). | - |
| TEST-PLAN C9 :18 "Child process owns data-directory lock, persists B before INIT, exits; new process reopens ... do not count a same-process close as this proof" | D-R10 P-R10 | PLANNED, under-specified: see section 5 (one host cannot reach PUBLISHED; the component metadata/journal must be file-backed; kill only after a durable observable). | R11 |
| TEST-PLAN additions :244-245 "intact restart with metadata unavailable", "startup cleanup failure", "last-CLOSED wake" | P-R3, (none), P-R5 | P-R3 planned (B1 above); startup cleanup failure has no P (R13); P-R5's "J's wake delivered" has no mechanism in the embedding (R12). | - |

## Section 2. Mechanism refutation by scenario, per decision

Classification: NEW MECHANISM = an owner or path the design needs and nobody has; NEW SHAPE =
an existing mechanism whose ordering, predicate or typing the design states wrongly; recorded =
true as written, routed.

### D-R1 The restart model

- Scenario "two nodes restarting": the embedding's three managers share one journal
  (`fixture :240` `metadata.manager()` over `metadata.db`; `createOriginFixture :13`), so each
  node's inventory must filter by `consensusSlotRequest.nodeId` (the draft says so). No P
  restarts two hosts; no mutation "filter removed" (a foreign row re-entered on this node is
  refused INVALID_LINEAGE at `captureRetirement :36` / `captureWasmCreation :212`, which then
  collapses into the deferral of B3). Missing cell. NEW SHAPE -> R7.
- Scenario "restart during a re-entry" (a process loss, not two re-entries in one process; the
  draft's edge row answers the latter with the in-flight guard, which is the wrong question):
  the FRESH open writes the journal claim first (`resolveWasmCreationAdmission :229` ->
  `claimConsensusCreationOpening :318-322`), then creates the file (`openWasmServiceDatabase
  :188-191`), then writes root + local record in one transaction (`openReplicaResources
  :114-118`). A crash after the claim and before the records leaves `opening_json` RETAINED with
  no file, or a file with zero tables. Restart: the inventory reads no LOCAL table
  (`readWasmCreationLocal :97` -> null) and classifies ... ABSENT (the draft's cell "no local
  file yet -> re-entered HELD"); the re-entry opens RETAINED and is refused `STORAGE_MISSING`
  (`openWasmServiceDatabase :180-187`, `openWasmCreationRecords :282`) -> B3's deferral loop.
  This is the recorded first-opening-claim/file gap (stage-1 7', HANDOVER :152) arriving in
  this stage's lap: the inventory must read `opening_json` and classify ABSENT-unclaimed
  (legitimate FRESH re-entry) apart from ABSENT-claimed / present-empty (storage loss after the
  claim: permanent typed refusal; its REMOVE closes the slot through STORAGE_MISSING). NEW
  SHAPE -> B3, R5.

### D-R2 One restart scan, journal and local record only

- Owner/dependency: `inventoryRetainedCreations()` is specified as a MANAGER method that reads
  the local phase "BY PATH from dataDirectoryManager.getWasmServiceDbPath". The manager has no
  data-directory owner and no node identity (`ServiceLifecycleManager` constructor `:64-94`;
  the origin fixture's `manager() :66-73` injects neither); both live on the lifecycle
  (`wasm-service-lifecycle.js:144-147, :165-167`). Either the manager gains two dependencies it
  never had (and reads a wasm-service file from the service layer), or the local half of the
  inventory is the lifecycle's through the adapter chain and the manager's half is the journal
  scan, composed by the handler. The draft must pick and name it. NEW SHAPE (owner boundary)
  -> B4.
- `readWasmCreationLocal(db)` takes an open connection (`:96`); there is no by-path reader in
  the opening module (only `tombstoneWasmCreationLocal` opens by path, `:177-188`). "Cite or it
  does not exist": the by-path read is a surface to create; name its connection mode (a
  read-only better-sqlite3 connection on a WAL file needs a writable `-shm` or the
  `immutable` flag; a read-write connection used only for reads is the safe default) and that
  it closes before the re-entry opens the file. -> R15.
- `STORAGE_MISSING` is defined as "file present, creation-only tables absent:
  `isCreationOnlyDatabase`". `isCreationOnlyDatabase :246-248` is the predicate "exactly the two
  creation tables and nothing else" (used by `WasmWriterState :83` to decide whether to create
  the application tables). The opening module's STORAGE_MISSING is `tables.length === 0` on a
  RETAINED open (`:282`) or the file absent (`openWasmServiceDatabase :180-187`). Miscitation ->
  B3/R5.
- Scenario "inventory reads a file another process still holds": excluded by the directory
  owner (`acquireDataDirectoryProcessOwner :32-45`, BEGIN EXCLUSIVE, busy_timeout 0) once the
  inventory runs after acquisition; a crashed process's SQLite locks are released by death. The
  first opener recovers an un-checkpointed WAL. Correct, unstated; state the ordering
  "acquire -> inventory" as the invariant. recorded -> R13 (witness).

### D-R3 Re-entry under the creation's own id, one path

- CREATE re-entries: correct; `scheduleBoundReentry :141-149` and the RV5.1 id discipline.
- REMOVE re-drive for RETIRED entries "through `routeBoundRemoval` by the creation's id":
  `routeBoundRemoval :406-416` -> `settleRemoval :377-396` emits `RUNTIME_SERVICE_REMOVE_*`
  under `params.operationId`. RV5.1's one-id premise (creation id = the ADD replica-operation
  id) does not extend to REMOVE: a REMOVE workflow row has its own id. A REMOVE outcome emitted
  under the creation id addresses the ADD row (`EXECUTOR_OUTCOME_ACTION_MAP :114-119` COMPLETE).
  In the embedding the emitter is an event sink (`fixture :241-245`), so nothing breaks there;
  in production it is a misdirected COMPLETE. The restart re-drive has no REMOVE request to
  answer: it must perform the redo and set the memo (REMOVED on CLOSED, REMOVING on HELD)
  WITHOUT emitting, leaving REMOVE_* outcomes to request-driven REMOVEs (which then find the
  memo and answer idempotently: `handleRemoveReplica :625-657`). NEW SHAPE -> R6.
- The re-drive must register an in-flight REMOVE entry keyed so that
  `hasInProgressReplicaRemoval :506-516` sees it; otherwise a REMOVE arriving mid-redo starts a
  second `retireWasmCreation` (idempotent, but a second RELEASING/CLOSED round trip). -> R6.

### D-R4 Intact PUBLISHED restart (GRANT_UNCONFIRMED)

- Scenario "I restarts UNCONFIRMED while J was selected offline" (the brief's case), and the
  plain "metadata UNAVAILABLE at restart" case:
  1. The manager runs before the adapter: `resolveRetainedAdmission :160-174` turns an
     UNAVAILABLE owner into `{UNKNOWN, reason: UNAVAILABLE}` (`:168` via `unresolvedResult
     :132-137`) and `continueRetainedCreation :143` returns it; the adapter is never called;
     the replica never opens. The draft amends this function "for a creation whose local
     record is PUBLISHED", but the manager has no local phase to consult (it is read at
     `openWasmCreationRecords :287-291`, after the database opens, `openReplicaResources
     :112-115`). NEW MECHANISM (unowned input) -> B1, B4.
  2. If the open does proceed and answers SERVING-UNCONFIRMED with a PUBLISHED start result,
     the manager's `confirmPublishedAuthority :114-137` re-resolves, gets UNAVAILABLE and
     answers `{UNKNOWN, reason: UNAVAILABLE}` (`:134-135`); the handler writes a DEFERRED memo
     (FAILED + deferRetry). The draft names neither this function nor the handler mapping.
     The promised "CREATE_ACTIVE with grantConfirmation in the outcome detail" cannot be
     produced: `buildExecutorOutcome` keeps only errorCode/deferRetry (RV3.2/RR2), and an
     ACTIVE memo never re-enters (`replyToExistingReplica :358-378`, RV7.3), so an UNCONFIRMED
     replica with an ACTIVE memo has no re-confirmation trigger from the handler side either.
     NEW MECHANISM -> B1.
  3. "The creation reconciliation re-confirms on its existing keyed run (wake or cadence)": a
     replica that opens SERVING does not `bind()` native events (`openReplicaResources :129`,
     `admitsNativeWake :44-46`, N16). There is no cadence in this scope (contract :143). The
     only trigger is an explicit `request()` (a handler re-entry), which does not come (point 2).
     And even an explicit run that confirms fires no wake (`publish :98`: suppressed when
     `waited || !flipped`; the run did not flip). Nothing re-confirms. NEW MECHANISM -> B1.
  4. The same gap bites the metadata-REACHABLE restart (P-R2): the handler's one-shot re-entry
     runs right after the inventory, usually before the restarted group has elected a leader;
     `progressWasmCreationGenesis :41-61` then answers HELD (`observeMembership` needs
     `readStatus` CORE_OK and a committed stamp with `gateOpen`), `boundStartResult :110-115`
     answers HELD, the handler memo stays HELD, no projection re-runs, and because the replica
     is SERVING it binds no events and no later run or wake exists. The replica serves,
     discovery keeps the surviving services row, but the operation never settles ACTIVE and the
     endpoint row stays at the old boot incarnation (see D-R6). In production the planner sees
     "slot PUBLISHED + row present -> satisfied" and re-dispatches nothing. NEW SHAPE (N2's
     "a restarted process re-enters through its own START and collects its own result" assumed
     the START runs after formation; the handler's START does not wait). -> B1.
  5. Fix shape I can see with the existing owners: (a) the manager passes UNAVAILABLE through
     as a tentative retained admission (phase UNAVAILABLE) and the OPENING module decides
     (local permission owner): local PUBLISHED -> SERVING with `grantConfirmation:
     UNCONFIRMED`; local ADMITTED/ABSENT -> the typed UNAVAILABLE refusal; (b) the lifecycle
     answers a new `CONSENSUS_BOOTSTRAP` member (e.g. `PUBLISHED_UNCONFIRMED`, beside
     PUBLISHED_UNPROJECTED) that `confirmPublishedAuthority` recognises: CONFIRMED -> PUBLISHED
     path; UNRESOLVED -> keep the typed UNCONFIRMED answer (never UNKNOWN); CONTRADICTED
     (ADMITTED phase CLOSED/RELEASING is already in `CONTRADICTING_OUTCOMES :73-74`) -> the
     existing retire-by-creation; (c) the handler maps PUBLISHED_UNCONFIRMED to a HELD-class
     memo (re-enterable, custody kept) and CREATE_HELD; (d) a replica that opens SERVING but
     unconfirmed, or opens SERVING before genesis is observable in this process, keeps its
     native subscriptions until the first run that confirms (per-instance `confirmed` latch
     distinct from `flipped`), and that run fires the OBSERVED wake once so the handler's
     re-entry collects PUBLISHED; unbind then (N16's per-commit cost stays bounded to the
     unconfirmed window). This keeps one decision owner per question and uses only existing
     surfaces plus one vocabulary member and one latch.
- "ADMITTED -> impossible by construction -> typed CORRUPT_STATE, serving fenced HELD": this
  supersedes D2' :451-452 ("metadata ADMITTED with local PUBLISHED is HELD (re-grant on
  re-entry)"), N2 scenario B, and today's `openServingState :54-58` (HELD). The impossibility
  argument holds (local PUBLISHED is written only after the owner answered PUBLISHED,
  `publishWasmCreation :77-79`; slots never regress), so CORRUPT_STATE is defensible, but
  "fenced HELD" is not fail-closed: a HELD open re-grants on the next re-entry and
  `recordLocalGrant` answers ALREADY, i.e. it self-heals exactly as D2' said. Decide: refuse the
  open (permanent) or keep D2'; record the supersession either way (R09). NEW SHAPE -> R8.
- Which owner answers count as "UNAVAILABLE": `resolveInstanceResource` returns
  `{outcome: UNAVAILABLE}` on a read fault (`readState :45-55`) and THROWS when the owner object
  itself is broken; `resolveWasmCreationAdmission :222` lets a throw propagate raw. Define both
  (UNAVAILABLE class) and exclude UNKNOWN-from-exception from the GRANT_UNCONFIRMED conversion
  unless intended. -> R8.
- "a local ADMITTED record with metadata PUBLISHED (lost CAS reply) reopens HELD and the
  re-entry's grant is idempotent (D1')": correct and reachable today (`openServingState` HELD,
  `bind()`, `resolveGrant :32-40` SAME -> PUBLISHED, `recordLocalGrant`, `enableServing`), given
  the group has re-formed. P-R4 should state the formation precondition.

### D-R5 Retirement custody across restart (RETIRED re-drive)

- Mechanism: correct as traced. `retireWasmCreation :145-159` with no live replica ->
  `retireLocally :109-126` records the RELEASING attempt (CLOSED slot answers CLOSED, `:277`),
  `tombstoneByPath` ALREADY, `closeRetired` CLOSED-or-already -> wake; UNAVAILABLE ->
  CLOSE_UNRESOLVED -> `RETIREMENT_DECISIONS :352-359` HELD -> REMOVE_HELD, memo REMOVING.
  recorded.
- "the creation row and the STOP row complete": there is NO STOP row for a bound retirement
  (`stopReplica :423-429` -> `retireConsensusCreation :92-110`, "no generic STOP row"; N4/N14).
  P-R5 and P-R7 assert a row that does not exist. Only the creation row completes. NEW SHAPE
  (cite-or-it-does-not-exist) -> B2.
- Outcome identity of the restart re-drive: D-R3 above (R6).

### D-R6 The creation row completes at CLOSED

- The stated order "CLOSED CAS -> endpoint removal -> STOPPED projection -> rows COMPLETED" is
  inverted against the implemented and stage-1c-accepted order: `withdrawRetiredConsensus
  :117-128` removes the endpoint FIRST (`:119`), then `driver.stop` (fence, RELEASING,
  tombstone, CLOSED: `retireLocally`, `closeRetired`), then STOPPED on `closed === true`
  (`:123-126`); the accepted witness asserts `endpointDelete < closed < rowDelete`
  (`bound-creation-handler-embedding.integration.test.js:205-213`, acceptance "endpoint removed
  before CLOSED, STOPPED row after CLOSED"). The crash analysis and P-R7 ("CLOSED done, crash
  before STOPPED/endpoint removal") are built on the wrong sequence; P-R7 as written contradicts
  C6-7. Correct crash points, with the real order: (a) after endpoint removal, before the fence:
  local PUBLISHED, slot PUBLISHED, endpoint gone -> restart -> PUBLISHED re-entry -> serving;
  the re-projection rewrites the endpoint at the new boot incarnation; the lost REMOVE is
  re-dispatched by its owner; (b) after RELEASING, before the tombstone: local PUBLISHED, slot
  RELEASING -> `resolveRetainedAdmission :171` RESOURCE_CLOSED -> permanent FAILED named memo
  -> the next REMOVE retires by path (not "retire at reopen", which has no owner: edge row 3 is
  wrong); (c) after the tombstone, before CLOSED; (d) after CLOSED, before STOPPED; (e) after
  STOPPED, before the row: all three are the RETIRED re-drive, idempotent at every step
  (`ALREADY`, CLOSED monotonic, `deleteRuntimeReplicaServicesRow :164-181` on an absent row
  returns the owner's `success` with zero rows; confirm it is not `success: false`). BLOCKING
  (proof plan contradicts an accepted witness; the mechanism text misleads the implementer)
  -> B2.
- Boot incarnation across restart: the endpoint remover deletes only at the exact boot
  incarnation (`runtime-endpoint-publication-wiring.js:157-170`; `endpoint-incarnation-authority.js
  :30-33` "another incarnation -> stale, never retried"); the writer refreshes an older
  incarnation's row (`:275-278`). After a real restart a REMOVE that runs before the CREATE
  re-entry re-projected leaves the old-incarnation endpoint row in place (typed
  REFUSED_STALE_INCARNATION recorded, retirement continues). In production the endpoint
  currentness owner sweeps stale incarnations; the embedding has no sweeper. Record the owner
  (R17) and make P-R2 assert the endpoint row's incarnation after re-projection. The fixture's
  `bootIncarnation = BASE + slot` (`fixture :235`) must be bumped by `restartHost`, else the
  substitution hides this behaviour entirely (section 5). NEW SHAPE -> R9.
- "a bound REMOVE of a COMPLETED creation answers REMOVE_COMPLETED" is reachable only while the
  memo survives: after a restart the memo is gone, the inventory scans PENDING/IN_PROGRESS only,
  the services row was deleted at STOPPED, so `recoverLocalReplicaForRemoval :543-571` answers
  null and the REMOVE is NOT_FOUND (`:611-623`, the N6 typed edge). P-R8's REMOVE assertion is
  only in-process; say so, or add a journal-by-replica read (RV2.1 dropped it). -> R16.
- `readRetainedCreation`'s TERMINAL carrying the row state: consumer census is complete
  (`READ_DECISION :46-47` gains two rows; `RESUME_OUTCOME` unchanged -> FAILED permanent for a
  CREATE re-entry; `claimConsensusCreationOpening :310-312` refuses a late claim
  CONTENT_CONFLICT; `isConsensusCreationRow` rows are excluded from the scan by state). The
  row-completion write is one CAS (`transitionOperation :127-176`, WHERE operation_id AND
  state; `VALID_TRANSITIONS :31-34` allows IN_PROGRESS -> COMPLETED). recorded.

### D-R7 The last-CLOSED wake survives a restart

- Re-derivation on every re-drive: correct (`closeRetired :133`). recorded.
- "in the embedding, by the fixture's loopback delivery": no such path. The embedding's wake
  consumer is the handler, which matches a wake to a local memo by `token.operationId`
  (`findWakeTarget :316-333`); I's CLOSED wake carries I's token and lands SETTLED on I's memo;
  J's HELD founder on the same host is not matched. The loopback transport carries raft
  envelopes, not wakes. P-R5's "J's wake delivered" is vacuous: J's re-entry in the embedding
  is test-driven (an explicit CREATE re-dispatch), as in stage 1c; production's cross-node path
  is charter item 7 (R14). State it honestly and assert the wake's reason/token instead. -> R12.

### D-R8 PENDING row (lost admission reply, F3)

- The re-entry path `continueIntent :179-185` -> `reserveAndRetain` is right and idempotent on
  the owner for an applied reservation. "No new allocation" is false for a reservation that
  never applied (then this IS the allocation) - reword.
- Scenario "a PENDING row whose reservation was applied, then REMOVE, then restart": a REMOVE
  on the PENDING row answers REMOVE_COMPLETED without touching slot or row (`READ_DECISION
  :46`, RV3.3 row for NOT_ADMITTED: "a PENDING row MAY hide an applied reservation ... the
  recovery stage's restart scan re-reserves idempotently and the planner's RELEASING row then
  retires"). The restart re-entry then reserves (idempotently, or for the first time) and
  bootstraps a HELD founder for a replica the coordinator considers removed; only a further
  REMOVE retires it (the embedding has no planner). This is the owned continuation RV3.3
  promised, but it must be stated and witnessed: P-R12 variant "REMOVE on PENDING, restart,
  re-entry reserves, a REMOVE then retires". The slot blocks J until that REMOVE (contract:
  fail closed, acknowledged obligation preserved). NEW SHAPE (unstated consequence) -> R10.

### D-R9 The handler memo is rebuilt before any message is accepted

- Memo-before-re-entry ordering: consistent with `scheduleBoundReentry :141-149` and the
  route's `settleCreation` rewriting the memo on settle. recorded.
- `ready`: `handleMessage :200-220` has no gate today; `registerWithRouter :861-894` registers
  immediately; production constructs and registers at `runtime-service-handler-setup.js:177-192`
  (the activation quest's insertion point, charter item 13). The embedding dispatches directly
  (`fixture :267-271`), so "awaits ready before delivering" is a test discipline; make it a
  fixture invariant (dispatch refuses before ready) so a test cannot skip it.
- "a wake ... before ready is not accepted": unreachable in the embedding. Wakes are delivered
  from inside a continuation run of a replica that exists only because a re-entry (after the
  memos) opened it; before `ready` no replica exists. State it as unreachable-by-construction or
  drop it; do not type an edge nothing can reach. -> N4.
- NOT_READY reply shape: to be a retry signal it must carry `deferRetry: true` (the only field
  the coordinator classifies, transport-delivery item 3; RV3.2). And RV3.2's honest statement
  applies: today's coordinator FAILs a runtime-service deferral; "producer retries" is the
  activation quest's B9. -> R14.
- REMOVE racing the restart re-entry for the same creation (after `ready`, before the
  setImmediate re-entry runs): `handleRemoveReplica` on a HELD named memo tracks and runs
  `routeBoundRemoval` while the scheduled CREATE re-entry runs `resumeConsensusCreation`; the
  lifecycle is safe (retire during start -> STOPPED_DURING_START class, P9/P10), but the memo is
  written by whichever settles last (`settleCreation :111-112` and `settleRemoval :381, :391`
  are two writers; `routeRuntimeServiceCreate` does not consult
  `hasInProgressReplicaRemoval`). Custody follows the slot and row, so no loss, but the custody
  table of RV7 has no cell for it. Add the cell and its expected memo. -> R7.

### D-R10 Process custody

- C9 as written ("the child runs one embedding host, persists B and the local record
  (ADMITTED, then PUBLISHED)"): a single host cannot reach PUBLISHED. Genesis requires the
  committed founding membership of all founders (`matchesFounders :30-35`, three canonical
  founders in the fixture), so the child must run the whole three-host embedding and the parent
  must restart all three directories and re-form the group before asserting "valid serving".
  The component metadata and journal must be FILE-backed and shared between child and parent
  (`createCreationSqliteFixture :39` supports `options.databasePath`; the default is
  `:memory:` and dies with the child). The kill must land only after a durable observable the
  parent can read through a second connection (local record PUBLISHED, or the child's marker
  written after `commitDurably` returned, as the custody precedent does with an artifact file:
  `replica-lifecycle-durable-generation.test.js:90-105`), and the child's exit signal must be
  recorded as SIGKILL. The label "actual child process evidence" belongs on exactly that
  witness. -> R11.
- "a failed startup cleanup keeps the lock and the inventory is not applied": no witness
  (section 1). -> R13.

### D-R11 Typed refusals, four distinct

- See B3: distinct in the opening/retirement owners, one deferral at the handler. The inventory
  pre-classification rescues CORRUPT and MISMATCH only if it compares all seven identity fields
  (`opening` from `opening_json`, `storage` from `getWasmServiceFileIdentity`), and STORAGE_MISSING
  only if it reads `opening_json`. RESOURCE_CLOSED-at-open never reaches the open (the manager
  answers it first, `:171`) and UNAVAILABLE must become GRANT_UNCONFIRMED only for local
  PUBLISHED. The remaining open-time refusals (a FRESH/RETAINED mismatch, a binding digest
  mismatch, CORRUPT in a file the inventory read as healthy) still need the code to flow:
  carry the open's `.outcome` as the driver FAILED result's `diagnostic.code` and let
  `confirmConsensusBootstrapResult` surface it as the UNKNOWN reason so the handler can map
  permanent codes to a permanent FAILED memo and UNAVAILABLE to a deferral. -> B3.
- REMOVE on a CORRUPT local file: `tombstoneByPath :84-86` answers `{outcome: CORRUPT_STATE}`
  -> `LOCAL_RETIREMENT.REFUSED` -> handler: not in `PERMANENT_RETIREMENT_REFUSALS :48-49` ->
  REMOVE_HELD, memo REMOVING, re-drivable forever; MISMATCH (CONTENT_CONFLICT) is permanent
  REMOVE_FAILED. The draft types both as "refuse typed"; decide whether CORRUPT_STATE is
  permanent (I think it is: no re-drive can heal a corrupt record) and witness it in P-R9.
  -> N5.

## Section 3. Owner interaction (one owner per decision)

- Scan = manager: journal half yes; local half needs the lifecycle's path owner and node id
  (B4). The brief's rule "any second owner or copied authority is a finding": D-R4 makes the
  manager's `resolveRetainedAdmission` decide on "local record PUBLISHED", a fact only the
  opening module can read; and it leaves `confirmPublishedAuthority` to re-derive the same
  question from the owner a second time with a different answer (UNKNOWN). Two decision sites
  for one question (R01), one of them without its input (R03). -> B1, B4.
- Re-entry = handler route: yes for CREATE; the REMOVE re-drive's outcome identity is wrong
  (R6).
- Local permission = opening module: the GRANT_UNCONFIRMED decision must live there
  (`resolveWasmCreationAdmission` + `openWasmCreationRecords` + `openServingState`), with the
  manager consuming the typed answer. -> B1.
- Serving = serving-state: `grantConfirmation` belongs there; `enableServing :146-153` is
  unaffected for an open-time SERVING instance (leader effects arrive through `onBecameLeader
  :558-565` guarded by `serving`). recorded.
- Retirement = lifecycle: yes (`retireWasmCreation`); the creation-row completion belongs to the
  manager's bound STOP branch (its own row) - fine - but it must run AFTER
  `withdrawRetiredConsensus` returned `closed === true` (the STOPPED projection is inside the
  runtime), i.e. in `retireConsensusCreation :101-103` where STOPPED state is set. Say so.
- `readRetainedCreation` TERMINAL with row state: consumers censused above; no second
  interpretation found. recorded.
- Interaction registry: the new interaction (inventory -> handler memo -> re-entry) spans the
  manager, the opening module and the route; `impact-contracts.json:1184-1195, 2402-2414` pairs
  the route with bootstrap/publication only. The recovery stage must extend the pair (or add
  one) with the embedding restart witness as the paired test (owner-interaction item 10).
  -> R16.

## Section 4. Temporal

- D-R6 order: inverted (B2). With the real order every crash point is covered by either the
  PUBLISHED re-entry (metadata reachable or not) or the RETIRED re-drive, with one exception
  the draft mis-owns: after RELEASING before the tombstone, the retirement is REMOVE-driven,
  not reopen-driven (R2/B2).
- D-R9 memo before re-entry, `ready` before transport: holds; `ready` must be defined as
  "memos written" (re-entries may still be scheduled), which the draft implies. recorded.
- D-R7 no durable wake: holds.
- D-R4 UNCONFIRMED window: the re-entry runs before the group re-forms; nothing later fires
  (B1 point 4). This is the one temporal hole that breaks the frozen claim.
- Two writers of the memo under a REMOVE/re-entry race (R7).
- Formation circularity (sealed): the restart depends on the journal (production: a system
  table) and on the group re-forming (raft) before the handler's one-shot START can collect
  PUBLISHED; the local stop still never waits on metadata (`tombstoneRetiringReplica :239`
  waits only for the attempt to settle, A1). The first dependency is R1; the second is B1
  point 4.

## Section 5. Harness fidelity

What `restartHost(slot)` (handler.shutdown, lifecycle.shutdownAll, owner.release, addHost over
the same directory) models faithfully: the memo loss (`shutdown :942-950` clears), the local
record and journal surviving, a fresh lifecycle/driver/runtime/manager composition, the
directory re-acquired. What it cannot prove, and what each substitution hides:

1. Un-checkpointed WAL and `-shm` recovery: `shutdownAll` closes every connection
   (checkpoint on last close); only SIGKILL leaves frames in the WAL for the next opener. (C9.)
2. Mid-flight work cut by death: `shutdownAll` JOINS in-flight continuations and CAS awaits
   (`retireReplica :267-268` `creationReconciliation.shutdown()` -> `awaitCurrentWorkIdle`), so
   no CAS is ever mid-flight at teardown; a lost reply must be injected by seam (`loseReply`).
   Honest only if P-R5/P-R6 say the crash point is a seam, not a kill.
3. Raft-rs durable state as left mid-Ready: the store syncs what raft says must be synced
   before sending (`raft-rs-durable-store.js:13-23`); a same-process close never exercises the
   "crash after send, before apply" window. (C9; power loss is explicitly not claimed.)
4. Boot incarnation: a real restart mints a new one; `fixture :235` fixes it per slot. Keeping
   it hides the stale-incarnation endpoint behaviour of D-R6 and makes P-R2's "rows re-marked"
   pass for the wrong reason. `restartHost` must bump it. (R9.)
5. Module-level singletons survive a same-process restart: `heldDataDirectoryDatabases`
   (released correctly `:51-59`), `ConfigurationManager`/`LoggingService` singletons reset per
   host by `directoryOwner :70-77`, `DataDirectoryManager.getInstance()` fallback (the fixture
   supplies its own, `:225`). State them; none is a defect, all are substitutions.
6. Virtual clocks restart at 1000 ms (`fixture :203`); the local record's `at` and the journal's
   `created_at` ordering do not depend on monotonicity across restart (`validDetail :71-73`
   requires a counter only). Fine; say so.
7. The handler is not registered with the router in the embedding (`e.dispatch` calls
   `handleMessage` directly); `ready` is therefore a test discipline, not a transport gate.
   Make the fixture refuse dispatch before ready (R14).
8. Metadata UNAVAILABLE = gateway read fault on `owner-a` only; the journal reader is a
   separate seam. Label P-R3 accordingly (R1).
9. C9 child harness: three hosts in the child, file-backed component DB shared with the parent,
   kill after a durable observable, exit signal recorded, parent re-forms the group before
   asserting (R11). The precedent for a labelled child run exists
   (`replica-lifecycle-durable-generation.test.js:101-105`).
10. P-R2 "rows re-marked ALREADY_PRESENT (RV5.4)": the PRESENT latch is per instance
    (`markServicesRowPresent :99-107`); after a restart the new instance answers PRESENT and
    replays one role write. The expected value is PRESENT, not ALREADY_PRESENT; the services
    row UPDATE-first path (`writeRuntimeReplicaServicesRow :183-203`) is what makes the
    re-projection idempotent. (R9.)

## Section 6. Proof plan: missing cells and mutations

Cells with no P (each must be a witness or recorded uncovered):

- restart during a FRESH re-entry (crash between claim and records; file absent / file with zero
  tables): typed permanent refusal at the inventory, REMOVE closes through STORAGE_MISSING. (R5)
- two hosts restarting (per-node inventory filter; group re-forms with two restarted members);
  mutation "filter by nodeId removed". (R7)
- metadata UNAVAILABLE at reopen with local ADMITTED or ABSENT -> deferral, nothing opens (edge
  row 2 has no P); mutation "GRANT_UNCONFIRMED granted for local ADMITTED". (B1)
- re-entry before the restarted group has re-formed: HELD-while-serving, then the confirming
  run wakes the handler and the operation settles ACTIVE; mutation "no wake on the confirming
  run" / "events unbound at an unconfirmed open". (B1)
- UNCONFIRMED serving, owner later answers RELEASING/CLOSED: retired through the manager's
  CONTRADICTED branch (or whichever owner the revision names); today no path exists. (B1)
- REMOVE racing the restart re-entry for the same creation: expected memo and outcomes. (R7)
- REMOVE on a PENDING row, restart, re-entry reserves, a later REMOVE retires. (R10)
- startup cleanup failure withholds the owner release and no inventory runs; a second process
  cannot run the inventory while the first holds the directory (C9 variant). (R13)
- stale-incarnation endpoint row after restart: re-projection refreshes it; a REMOVE before
  re-projection records REFUSED_STALE_INCARNATION and the row's owner is named. (R9)
- CORRUPT_STATE on REMOVE: permanent or re-drivable, witnessed. (N5)
- copied-file restart (B4): inventory MISMATCH on `storage`, permanent FAILED, no open, no
  deferral loop; mutation "inventory compares five fields only". (R4)
- COMPLETED creation row after restart: REMOVE answers NOT_FOUND (or the journal-by-replica
  read the revision adds). (R16)

Mutations the draft lists that do not kill what they claim: "re-drive order changed (P-R7)" -
P-R7's expected order is the wrong one, so the mutation and the witness swap roles against the
accepted C6-7 (B2). "memo written after the re-entry is scheduled (P-R11/P-R1)" - P-R11 tests
`ready`, not memo order; the memo-order mutation needs a witness that delivers a CREATE/REMOVE
between the re-entry's scheduling and its first await (R7). "UNCONFIRMED treated as CONFIRMED
(P-R3 CLOSED branch)" - unkillable until B1 gives the CLOSED branch an owner.

## Section 7. Scope

- In scope and correctly taken: COMPLETED-row re-entry (A-B6), restart-scan retirement (A-B3
  restart half), intact restart with metadata unavailable (B-§4/R8), N6, RV2.1's PENDING-row
  item, V-N21's deferral-flag note (not addressed: the REMOVE-deferral memo still lacks the
  flag; RV7.1 asked for one vocabulary - recorded, N6).
- Pulled in from another owner, correctly routed: production startup wiring (charter item 13
  already cites D-R1/D-R9), cross-node wake (item 7), TimerManager (B-N2), tombstoned-path
  cleanup (A-D2-2). Add: the endpoint-incarnation currentness sweep (production owner of
  stale-incarnation rows) and the production journal reader's availability under quorum loss
  (R1) as recorded R17 items.
- Deferred in scope: `storage` in the by-path tombstone identity (F-R1) is deferred again
  ("compared when present"); for the restart inventory it is required (R4). The first-opening
  claim/file gap (stage-1 7') is now a recovery-stage cell, not deferrable (R5).
- Widening I did not find: the draft touches no production wiring and no new timer. Good.

## Template pass (sealed bar; only what the sections above did not already say)

- owner-interaction #1/#2: B1, B4 (two decision sites for local permission; manager without
  its input). #6 wake/release: B1 point 3-4 (no release path for UNCONFIRMED or
  HELD-while-serving). #9 escape hatch: none found; the route stays the one path. #10 registry:
  R16.
- admission-gating #1 precheck-predicts-enforcement: the inventory's by-path classification is
  a precheck of the open; with five fields it admits what the open refuses (copied file) ->
  B3/R4. #2 transient vs terminal: the three-stage code collapse makes every terminal open
  refusal transient at the handler -> B3. #5 hold release: UNCONFIRMED has no release
  observable -> B1.
- concurrency-serialization #2 TOCTOU: inventory classification vs the open's own read is safe
  only because this node is the sole writer of its local file; state it. #3 single-winner:
  REMOVE vs restart re-entry has two memo writers -> R7.
- recovery-replay #1 never clobber live with stale: the inventory runs before any live memo
  exists (ready gate) - correct. #2 restart vs live: `ready` is the discriminator - correct.
  #4 replay idempotence: the RETIRED re-drive and the row completion are CAS-idempotent -
  correct. #5 absence proves nothing: ABSENT-claimed treated as "never opened" is exactly this
  failure -> B3/R5; a COMPLETED row invisible to the scan is treated as settled - correct
  (the slot is CLOSED).
- transport-delivery #1/#3: NOT_READY without `deferRetry` is an ACK-shaped refusal nothing
  retries -> R14. Wake delivery is in-process; no transport claim is made - correct.
- harness-fidelity #1 red for the right reason: P-R7 would be red against the accepted order
  (B2); P-R2's ALREADY_PRESENT is a wrong expectation (R9); P-R5's J wake is vacuous (R12).
  #2 stub honesty: `restartHost` substitutions enumerated in section 5. #5 vacuity: P-R1's
  "today: NO_LOCAL_OPERATION" is right (N6); P-R10 as a one-host child cannot reach the state
  it asserts (R11).
- formation-circularity #1/#2: the restart's dependence on the journal (R1) and on re-formation
  before the one-shot START (B1 point 4); the local stop stays independent of metadata
  (correct, A1).
- retry-loops (out of bar, applied once because the deferral IS a re-drive): #1/#3 the B3
  deferral loop has no loud stop (every re-entry answers the same deferral); #6 duplicate
  effect safety holds for the RETIRED re-drive.

---

## Required changes

Blocking (REVISE):

- B1 Give the UNCONFIRMED grant and the HELD-while-serving restart an owner and a release
  path: the opening module decides GRANT_UNCONFIRMED (local PUBLISHED only), the lifecycle
  answers a typed PUBLISHED_UNCONFIRMED, `confirmPublishedAuthority` consumes it (UNRESOLVED
  keeps it typed, CONTRADICTED retires through the existing branch), the handler keeps a
  HELD-class memo, the replica keeps native subscriptions until a run confirms and that run
  fires one OBSERVED wake; `resolveRetainedAdmission` passes UNAVAILABLE through instead of
  deciding on a local fact it cannot read. State who closes an UNCONFIRMED I selected for
  retirement offline (a REMOVE dispatch), not a re-confirmation.
- B2 Correct the retirement order to the implemented and accepted one (endpoint removal ->
  fence/RELEASING -> tombstone -> CLOSED -> STOPPED -> creation row COMPLETED), redo the crash
  analysis and P-R7 against it, drop "the STOP row" (none exists for a bound retirement), and
  move "retire by token at reopen" (edge row 3) to its real owner, the next REMOVE.
- B3 Make B4's four refusals reach the handler typed and permanent: the inventory reads
  `opening_json` and compares all seven identity fields (ABSENT-unclaimed vs ABSENT-claimed vs
  present-empty; MISMATCH incl. `storage`), the open's `.outcome` flows through the driver's
  FAILED result and `confirmConsensusBootstrapResult` to the handler's permanent/deferral
  mapping, and `isCreationOnlyDatabase` is dropped from the STORAGE_MISSING definition.
- B4 Place the inventory's local half with an owner that has the path and the node id (the
  lifecycle through the adapter chain, or an explicitly injected data-directory owner on the
  manager, named and justified), and keep local permission in the opening module (one decision
  site).

Required with the revision:

- R1 Bound the B1 claim: "without a live metadata quorum" holds for the metadata owner's read;
  the creation journal must be readable (component SQLite here; the production reader under
  quorum loss is the activation quest's, recorded R17).
- R2 Edge table row 3 and D-R4's RELEASING/CLOSED branch: the manager's RESOURCE_CLOSED answer
  before the adapter, permanent FAILED named memo, REMOVE-driven retirement.
- R3 Section 1 citations: `_readRecoverableOperations :521-543`, fixture `addHost :199-249`,
  `retireLocally`/`closeRetired` lines, `withdrawRetiredConsensus :117-128`,
  `confirmPublishedAuthority :114-137`, `boundStartResult :105-115`, `admitsNativeWake :44-46`.
- R4 `storage` (and `opening`) compared by the restart inventory, not "when present".
- R5 The first-opening-claim/file gap as an inventory cell with a witness.
- R6 The RETIRED re-drive emits no REMOVE outcome; it sets the memo and registers an in-flight
  REMOVE entry; request-driven REMOVEs answer idempotently.
- R7 Cells: two-host restart (+ filter mutation); REMOVE racing the re-entry (custody-table
  row); memo-order mutation with a real witness.
- R8 Record the D2'/N2-B supersession for (local PUBLISHED, metadata ADMITTED) and decide
  refuse-vs-HELD; define the UNAVAILABLE class (read fault vs thrown owner).
- R9 `restartHost` bumps the boot incarnation; P-R2 expects PRESENT + one role write and asserts
  the endpoint row's incarnation; record the stale-incarnation sweep owner (R17).
- R10 D-R8 wording ("no new allocation" only for an applied reservation) and the
  REMOVE-then-restart cell.
- R11 C9: three hosts in the child, file-backed component DB (`databasePath`), kill after a
  durable observable, SIGKILL recorded, parent re-forms before asserting.
- R12 D-R7/P-R5: no J wake exists in the embedding; assert reason/token of I's CLOSED wake and
  drive J explicitly; production path is charter item 7.
- R13 Witness for "inventory only under the held owner" and "startup cleanup failure withholds
  the inventory" (or cite the custody witness and state the ordering as the invariant).
- R14 One scan entry point (what `recoverPendingOperations` does for consensus rows);
  NOT_READY carries `deferRetry: true` with RV3.2's honest statement; the fixture refuses
  dispatch before `ready`.
- R15 The by-path reader is a surface to create in the opening module; name its connection
  mode and its close-before-reopen.
- R16 After a restart a REMOVE of a COMPLETED creation is NOT_FOUND (N6) unless a
  journal-by-replica read is added; extend the impact-contracts pair with the restart witness.

Recorded, not blocking:

- N1 The B1 safety premise includes the typed-absence CLOSED (D2') and the inode guard.
- N2 C7 conformance by construction; cite the witness.
- N3 A bound creation row is never FAILED today; `REMOVE_FAILED` for a FAILED row is typed for
  an unreachable state.
- N4 "wake before ready" is unreachable in the embedding.
- N5 CORRUPT_STATE on REMOVE: REMOVE_HELD today, MISMATCH permanent; decide and witness.
- N6 V-N21 (REMOVE-deferral memo lacks `deferRetry`) remains open; the recovery stage was named
  its owner.
- N7 A `restartHost` + `restartHandler` pair: C6-9 already proves the handler-only restart; the
  new witnesses must say which one they model.
- N8 Line drift is small; the draft's citations are otherwise accurate (checked: all of
  section 1).
- N9 Statics: the route module and the opening module will each gain a function; check the
  per-file complexity/cognitive ratchets and the unused-export ratchet at land (RV5.7), not
  here.

What the implementer must not do from this draft: do not make `resolveRetainedAdmission`
decide on the local record; do not map UNCONFIRMED serving to an ACTIVE memo; do not assert the
D-R6 order as written (it contradicts the accepted C6-7 witness); do not emit REMOVE outcomes
under the creation id from the restart re-drive; do not classify an ABSENT file as a HELD
re-entry without reading `opening_json`; do not reuse the slot's boot incarnation across
`restartHost`; do not count a one-host child as the C9 proof.
