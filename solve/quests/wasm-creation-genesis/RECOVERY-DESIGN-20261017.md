# Recovery stage design (draft, lead, 2026-10-17): process-loss recovery of bound creations at the embedding scope

Quest `wasm-creation-genesis`; lane `work/rs-raft-event-reconciliation-20261016`
at `381750de2` (stage 1c landed). Receipt owed: `process-recovery` (quest
`doneWhen`). Binding texts: `CONTRACT-R2.md` "Recovery, local permission and
process custody (B1/B4)" (:146-183) and its proof list (:239-245);
`HANDOFF-INTERFACES.md` (:25-35, :51, :99-100); the stage-1 design's deferrals
`SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md` 7' (A-B6, A-B3 restart
half, B-§4), D2' (open-time serving), D4' (retirement custody), D6' (wake);
`ACTIVATION-DISCOVERY-DESIGN-20261017.md` RV2.1, RV3.3, RV7.1-RV7.4, V-N9, N6
(:816); `TEST-PLAN.md` C2, C7, C8, C9 and the added items "intact PUBLISHED
restart versus durable RETIRED restart, crash on either side of local
retirement/CLOSED, last-CLOSED wake, startup cleanup failure, intact restart
with metadata unavailable". Scope: the sealed CONTRACT-R2 embedding scope
(owner ruling 2026-10-17); production startup wiring is routed to the
activation quest (section 7).

## 0. Claim, frozen as behaviour

After a process loss (the node process ends with its data directory durable)
and a restart (a new composition of manager, runtime, lifecycle and handler
over the SAME data directory under the exclusive data-directory process owner,
with the same component journal and metadata), every bound creation that this
node retained is recovered under its own operation id, from the creation
journal and the local record only, and nothing else happens:

1. A creation with a local record in phase PUBLISHED reopens the same resource
   (same B, peer/log identity, writer history, ordinal) and SERVES when the
   metadata owner confirms PUBLISHED for the exact token, serves on the local
   grant typed `GRANT_UNCONFIRMED` when the metadata owner is UNAVAILABLE
   (contract B1), and is retired by token when the metadata owner answers
   RELEASING or CLOSED (D2', vet B R8). It never issues a second INIT.
2. A creation with a local record in phase ADMITTED, or with no local file
   yet, is re-entered HELD under its own id and continues through the existing
   continuation (grant on the owner's PUBLISHED, D1'); a PENDING row resolves
   its lost admission reply with the same request (HANDOFF).
3. A creation whose local record is RETIRED (the tombstone is durable, CLOSED
   is not) redoes the CLOSED CAS from the retained token, removes its
   endpoint and projects STOPPED through the stage-1c remover, completes its
   creation and STOP rows, and wakes the successor (D6').
4. A creation whose row is COMPLETED is historical: re-entry is the typed
   TERMINAL answer, no effect; a REMOVE of it is idempotently COMPLETED.
5. The handler's memo is rebuilt from that inventory before the handler
   accepts any message (RV7.4: the memo is a cache; N6 closed), and every
   CREATE/REMOVE/wake afterwards behaves per the Revision 7 custody table.
6. Storage loss, a contradictory local file, a missing original binding and
   metadata read unavailability remain four distinct typed refusals (B4); no
   tombstone, root or grant is ever inferred.

Oracle: the component SQLite rows (journal `wasm_operations`, metadata,
`services`, `service_endpoints`) through a second connection; the local
record (`_wasm_creation_local`) read by path; the native INIT count of the
reopened file; the typed results of the restart re-entry; the handler's
emitted executor outcomes; for C9 the child process's exit and the parent's
reopen, labelled "actual child process evidence".

## 1. Consumed surfaces (cite or it does not exist)

| Surface | Where | Used for |
|---|---|---|
| Restart scan owner | `ServiceLifecycleManager.recoverPendingOperations` -> `service-lifecycle-recovery.js:312-332` (`_readRecoverableOperations :521-549`, PENDING + IN_PROGRESS rows ordered by `created_at`) | the one scan; today routes consensus rows to `recoverConsensusCreationRow :270-274`, which calls `recoverConsensusCreation` (policy + metadata resolve). NOT wired into production startup (no caller outside `src/service`): recorded for the activation quest |
| Journal-only read | `readRetainedCreation` (`service-consensus-creation-intent.js`, RV2.1) | TERMINAL before token; NOT_ADMITTED on a PENDING row |
| Continuation | `resumeConsensusCreation` -> `continueRetainedCreation` (`service-consensus-bootstrap.js:140-166`): STARTING, `adapter.createReplica`, `startReplica`, `confirmPublishedAuthority`; the creation row stays IN_PROGRESS (:153-157) | the re-entry of HELD/ADMITTED creations, unchanged |
| Bound re-entry on the node | `runtime-service-bound-creation-route.js` `scheduleBoundReentry` / `reenterRetainedCreation` (RV5.1, RV6.2) | the ONE re-entry path, keyed by the creation's id |
| Bound REMOVE | `routeBoundRemoval` -> `retireConsensusCreation` -> `WasmServiceLifecycle.retireReplica(creation)` (`wasm-service-lifecycle.js:481`) -> `retireWasmCreation` (D4' steps 1-6, retire-by-token by path when no replica is live) | the retirement redo |
| Local record | `wasm-creation-opening.js`: `readWasmCreationLocal :96`, `identityMatches :110`, `recordWasmCreationLocalPhase :139` (CAS, `commitDurably`), `tombstoneWasmCreationLocal :177` (by db or by path), `openWasmCreationRecords :268-292` (FRESH vs RETAINED, identity, RETIRED refusal), phases ADMITTED -> PUBLISHED -> RETIRED | the local permission (B1) |
| Open-time metadata read | `resolveWasmCreationAdmission :215-237` (requires owner ADMITTED, openable phase, token match, opening claim) called from `wasm-service-replica-lifecycle.js:183`; `openServingState` (`wasm-service-serving-state.js:49-58`): SERVING only when local PUBLISHED AND metadata PUBLISHED | amended by D-R4 for UNAVAILABLE |
| Creation reconciliation | `WasmCreationReconciliation` (`wasm-creation-reconciliation.js`): keyed run owning genesis and publication; `reconcile`, `publish`, `wake`, `retire` | the re-confirmation of an unconfirmed grant |
| Handler memo | `runtime-service-handler.js` `localReplicas` (custody table, Revision 7), `shutdown :942-950` (clears), `recoverLocalReplicaForRemoval :543-575` (services row -> memo for REMOVE) | rebuilt from the inventory (D-R9) |
| Process custody | `acquireDataDirectoryProcessOwner` (exclusive owner; PROCESS-CUSTODY acceptance 2026-10-16) | the restart runs under it |
| Discovery rows | stage 1c: `projectRuntimeReplicaServicesRow`, the endpoint writer/remover (binding-first, physical id), PRESENT mark by token | re-projection after reopen, removal after CLOSED |
| Wake | D6' in-process wake owner; `consumeCreationWake` (RV2.4, RV5.3) | last-CLOSED wake |
| Embedding | `test/wasm-service/bound-creation-handler-embedding-fixture.js` (`addHost :195-240`: per-node directory owner, process owner, cache, dependencies, lifecycle, driver, runtime, manager, handler) | gains `restartHost(slot)` and the C9 child harness |

## 2. Mechanism and decisions

- **D-R1 The restart model.** Process loss = the node process ends; the data
  directory (journal, local records, application files) is durable. Restart =
  a new composition over the same directory under the exclusive process
  owner; the component metadata/journal is the same store. The handler's memo
  starts empty (RV7.4). In this stage the embedding drives the restart
  (`restartHost(slot)`: `handler.shutdown()`, `lifecycle.shutdownAll()`,
  process owner released, then `addHost(slot)` over the same directory) and
  C9 uses a real child process; production startup wiring is one recorded
  call site (section 7).
- **D-R2 One restart scan, journal and local record only, no metadata.**
  `recoverPendingOperations` keeps its owner and ordering; for a consensus
  creation row it no longer calls `recoverConsensusCreation` (a metadata
  resolve at scan time contradicts B1). It answers a typed inventory entry per
  row through a new manager method `inventoryRetainedCreations()` (the scan's
  product for bound rows): `{operationId, intent, token | null, rowState,
  localPhase}` where `localPhase` is read BY PATH from
  `dataDirectoryManager.getWasmServiceDbPath(groupId, replicaId)` through
  `readWasmCreationLocal`: `ABSENT` (no file), `ADMITTED`, `PUBLISHED`,
  `RETIRED`, `STORAGE_MISSING` (file present, creation-only tables absent:
  `isCreationOnlyDatabase`), `CORRUPT` (`CORRUPT_STATE` from the read), or
  `MISMATCH` (identity does not match the journal's intent/token:
  `identityMatches`). Rows of other nodes are not in this node's inventory
  (the intent's `consensusSlotRequest.nodeId`). The scan performs NO physical
  effect and NO metadata read.
- **D-R3 Re-entry under the creation's own id, one path.** The node applies
  the inventory through the handler (`recoverRetainedCreations(inventory)`):
  for each entry it writes the named memo first (D-R9) and then schedules ONE
  bound re-entry keyed by the creation's operation id through the existing
  `scheduleBoundReentry` (CREATE re-entry) for `localPhase` ABSENT, ADMITTED
  and PUBLISHED, or ONE bound REMOVE re-drive (`routeBoundRemoval` by the
  creation's id) for RETIRED. Outcomes are emitted under the creation's id
  exactly as a wake-driven re-entry (RV5.1). No new re-entry path exists.
- **D-R4 Intact PUBLISHED restart (contract B1; vet B R8; B-§4 resolved).**
  For an entry with `localPhase` PUBLISHED the re-entry opens on the local
  grant: `resolveRetainedAdmission` and `resolveWasmCreationAdmission` keep
  requiring the owner's answer, but an `UNAVAILABLE` answer (owner
  unreachable, no quorum) for a creation whose local record is PUBLISHED is
  the typed `GRANT_UNCONFIRMED` metadata phase instead of a refusal; the open
  proceeds RETAINED (`openWasmCreationRecords`), `openServingState(local =
  PUBLISHED, metadata = GRANT_UNCONFIRMED)` answers SERVING with
  `grantConfirmation: UNCONFIRMED` on the replica; the creation reconciliation
  re-confirms on its existing keyed run (wake or cadence): PUBLISHED ->
  CONFIRMED (no effect); RELEASING or CLOSED -> `retireReplica` by token (R8:
  "Reconciliation later closes I"); ADMITTED -> impossible by construction
  (the local PUBLISHED is written after the authoritative CAS) -> typed
  `CORRUPT_STATE`, serving fenced HELD (fail closed). Metadata reachable at
  open: PUBLISHED -> SERVING as D2'; RELEASING/CLOSED -> the open is refused
  `RESOURCE_CLOSED` and the entry is retired by token (D4' by path). A local
  ADMITTED record with metadata PUBLISHED (lost CAS reply) reopens HELD and
  the re-entry's grant is idempotent (D1'). Why B1 is safe: J is allowed to
  serve only after I's local RETIRED exists (D4' step 4 before step 5), so an
  intact I that restarts serving on its local grant can never coexist with a
  serving J for the same slot.
- **D-R5 Retirement custody across restart (A-B3 restart half).** For an
  entry with `localPhase` RETIRED the re-drive runs `retireConsensusCreation`
  by the creation's id: the journal-only read yields the token
  (`admission_json`), `retireReplica(creation)` finds no live replica,
  tombstone answers `ALREADY`, the CLOSED CAS runs from the token
  (`closeInstanceResource`; ALREADY-CLOSED is success), the stage-1c remover
  deletes the endpoint by physical id and projects STOPPED, the creation row
  and the STOP row complete (D-R6), the wake fires (D-R7). UNKNOWN/UNAVAILABLE
  -> `REMOVE_HELD`, memo REMOVING, re-driven by the next REMOVE or the
  reconciliation cadence; nothing is retried in a loop.
- **D-R6 The creation row completes at CLOSED, never at PUBLISHED (A-B6).**
  The manager's bound STOP branch completes the creation row together with the
  STOP row after the CLOSED CAS and the discovery-row removal (order: CLOSED
  CAS -> endpoint removal -> STOPPED projection -> rows COMPLETED; a crash
  between any two leaves the row IN_PROGRESS with local RETIRED and metadata
  CLOSED, and the re-drive is idempotent at every step). `readRetainedCreation`'s
  TERMINAL answer carries the row state; a bound REMOVE of a COMPLETED creation
  answers `REMOVE_COMPLETED` (idempotent), of a FAILED one `REMOVE_FAILED`
  typed (RV3.3 amended); a CREATE re-entry of a COMPLETED row is the permanent
  TERMINAL memo (RV7.1) and a successor proceeds under its own id (RV7.2). The
  HANDOFF sentence "completes it only after the publication path completes" is
  superseded for bound creations by this clause (recorded, not rewritten).
- **D-R7 The last-CLOSED wake survives a restart.** The CLOSED CAS redone by
  D-R5 wakes through the same in-process owner (D6'); the successor J on
  another node is woken by the production cross-node wake path (activation
  quest R19) or, in the embedding, by the fixture's loopback delivery. No wake
  is stored durably: the wake is re-derived from the CAS result on every
  re-drive, so a lost wake is never a stuck slot (J's own re-entry on its
  cadence reads the owner).
- **D-R8 PENDING row (lost admission reply, F3).** The re-entry's
  `continueIntent` -> `reserveAndRetain` resolves the same request
  (HANDOFF: "a lost reservation response is resolved with the same request");
  no new allocation; a refusal is typed as today. A REMOVE of a still-PENDING
  row stays `NOT_ADMITTED -> REMOVE_COMPLETED` (RV3.3) and the row is left to
  this re-entry (RV2.1 recorded item resolved here).
- **D-R9 The handler memo is rebuilt before any message is accepted (RV7.4,
  N6).** `recoverRetainedCreations` writes a named memo per entry BEFORE
  scheduling its re-entry: ABSENT/ADMITTED/PUBLISHED -> `{status: HELD,
  operationId}`; RETIRED -> `{status: REMOVING, operationId}`; STORAGE_MISSING,
  CORRUPT, MISMATCH -> `{status: FAILED, operationId}` permanent (RV7.1; a
  REMOVE still routes bound and may CLOSE the slot: D2' allows CLOSED on
  `CREATION_STORAGE_MISSING`; CORRUPT/MISMATCH refuse typed, no tombstone is
  inferred: B4). The handler exposes `ready` (a promise resolved after the
  inventory is applied); the embedding awaits it before delivering; production
  (activation quest) registers the transport address after it. A wake or
  CREATE/REMOVE before `ready` is not accepted (typed `NOT_READY` reply /
  `NO_LOCAL_OPERATION` is NOT used for this: the difference is observable).
- **D-R10 Process custody.** The scan and the re-entries run only under the
  exclusive data-directory process owner (existing); a failed startup cleanup
  keeps the lock (PROCESS-CUSTODY acceptance) and the inventory is not
  applied. C9 is a real child process: the child runs one embedding host,
  persists B and the local record (ADMITTED, then PUBLISHED), is killed
  (SIGKILL), and the parent restarts the host over the same directory; "do not
  count a same-process close as this proof" (TEST-PLAN C9).
- **D-R11 Typed refusals, four distinct (B4).** `CREATION_STORAGE_MISSING`
  (file gone), `CORRUPT_STATE` (contradictory local file), `CONTENT_CONFLICT`
  (local identity does not match the journal; also a binding digest mismatch
  on reopen), `UNAVAILABLE` (metadata read unavailability, which only D-R4's
  PUBLISHED case converts into `GRANT_UNCONFIRMED`). None infers a tombstone,
  a root or a grant.

## 3. Typed edges added

| Edge | Answer | Observable | Recovery |
|---|---|---|---|
| metadata UNAVAILABLE at reopen, local PUBLISHED | SERVING, `grantConfirmation: UNCONFIRMED`; CREATE_ACTIVE under the creation id with `grantConfirmation` in the outcome detail | replica serves; services row PRESENT | reconciliation re-confirms; CLOSED -> retire |
| metadata UNAVAILABLE at reopen, local ADMITTED or ABSENT | deferral (RV3.2) under the creation id; memo HELD | nothing opens | next re-entry |
| metadata RELEASING/CLOSED at reopen, local PUBLISHED/ADMITTED | open refused `RESOURCE_CLOSED`; retire by token by path; CLOSED CAS; rows removed; rows COMPLETED; `CREATE_FAILED RESOURCE_CLOSED` under the creation id | tombstone RETIRED; no second INIT | none needed |
| local RETIRED, metadata not CLOSED | REMOVE re-drive -> CLOSED; REMOVE_COMPLETED under the creation id | STOP + creation rows COMPLETED | idempotent |
| local RETIRED, metadata CLOSED already, rows not removed | re-drive: ALREADY -> remover/projection -> COMPLETED | rows gone | idempotent |
| COMPLETED creation row | CREATE re-entry: TERMINAL permanent memo; REMOVE: REMOVE_COMPLETED | no effect | successor under a new id |
| STORAGE_MISSING / CORRUPT / MISMATCH | permanent FAILED memo with the code; `CREATE_FAILED <code>` under the creation id | no open, no INIT | REMOVE by token closes (STORAGE_MISSING) or refuses typed |
| message before `ready` | typed `NOT_READY` reply | - | producer retries |
| two re-entries for one creation (restart during a re-entry) | the in-flight guard keyed by the creation id (RV5.1) | one resume | - |

## 4. Cached-view audit

The inventory reads the journal and the local file only; neither the system
table cache (services rows) nor the handler memo decides anything at restart
(`recoverLocalReplicaForRemoval` stays the REMOVE-time fallback for rows
without a memo and is never reached for inventoried creations). The metadata
owner is read at re-entry (by the continuation and the open), never at scan
time. The reconciliation's re-confirmation reads the owner fresh (the keyed
run), never a cached phase. Discovery rows are presentation: a stale PRESENT
row after a crash is re-marked idempotently (`ALREADY_PRESENT`, RV5.4).

## 5. Identity anchoring

Every re-entry and every outcome is keyed by the creation's operation id
(RV5.1); the local file identity is checked against the journal's intent and
token by `identityMatches` (seven non-phase fields, D2') before any open; the
CLOSED redo uses the exact `admission_json` token; the endpoint removal uses
the physical id derived from the binding (stage 1c); a replica whose local
identity mismatches never opens and never tombstones (CONTENT_CONFLICT).

## 6. Proof plan (lab-first; red first; mutations by mechanism)

Embedding additions: `restartHost(slot)`; `killHostProcess` harness for C9
(child `node` process running one host from a script that the fixture owns);
owner fault injection: metadata `resolveInstanceResource` -> UNAVAILABLE,
RELEASING, CLOSED; journal write faults between the retirement steps.

| Id | Witness | Red mechanism |
|---|---|---|
| P-R1 | HELD before restart (no local file), restart: inventory ABSENT, memo HELD, one re-entry under the creation id, continues HELD; REMOVE afterwards routes bound and completes (N6 closed) | today: NOT_FOUND / NO_LOCAL_OPERATION |
| P-R2 | SERVING before restart, metadata reachable: reopen RETAINED, INIT count unchanged, SERVING, rows re-marked ALREADY_PRESENT, CREATE_ACTIVE under the creation id | today: the handler re-creates nothing (memo empty) |
| P-R3 | SERVING before restart, metadata UNAVAILABLE at reopen: SERVING `grantConfirmation: UNCONFIRMED`; owner later PUBLISHED -> CONFIRMED; owner later CLOSED -> retired by token (R8) | today: open refused UNAVAILABLE |
| P-R4 | local ADMITTED + metadata PUBLISHED (CAS reply lost) -> reopen HELD -> re-grant idempotent -> SERVING | D1' idempotence across restart |
| P-R5 | retired-not-closed before restart (CLOSE_UNRESOLVED): inventory RETIRED, memo REMOVING, re-drive: CLOSED, endpoint removed, STOPPED, STOP + creation rows COMPLETED, J's wake delivered | today: custody lost with the memo |
| P-R6 | metadata RELEASING written, crash before the tombstone: reopen refused RESOURCE_CLOSED, tombstone by path, CLOSED, rows removed | D2' + D4' across restart |
| P-R7 | CLOSED done, crash before STOPPED/endpoint removal: re-drive idempotent, rows COMPLETED | D-R6 order |
| P-R8 | COMPLETED creation row: CREATE re-entry TERMINAL (permanent memo), REMOVE REMOVE_COMPLETED, successor J under its own id proceeds | D-R6 |
| P-R9 | STORAGE_MISSING / CORRUPT / MISMATCH: permanent FAILED memo with the code, no INIT, no tombstone inferred; REMOVE by token closes the slot only for STORAGE_MISSING | B4 |
| P-R10 | C9 child process: child persists B + local PUBLISHED, SIGKILL; parent reopens: same B, old INIT refused, valid serving; labelled actual child process evidence | TEST-PLAN C9 |
| P-R11 | message before `ready` -> NOT_READY; after `ready` normal | D-R9 |
| P-R12 | PENDING row (lost admission reply): re-entry resolves the same request, no new allocation | D-R8 |

Mutations (each must redden its witness): inventory reads metadata (P-R3 reddens: UNAVAILABLE blocks the reopen); re-entry under the request/scan id instead of the creation id (P-R1); memo written after the re-entry is scheduled (P-R11/P-R1); UNCONFIRMED treated as CONFIRMED (P-R3 CLOSED branch); creation row completed at PUBLISHED (P-R8: J blocked by TERMINAL... and P-R2: re-entry refused); CLOSED redo skipped for RETIRED (P-R5); tombstone inferred on STORAGE_MISSING (P-R9); re-drive order changed (P-R7). Statics as RV5.7. Lab: the changed cone at the snapshot on one host; the C9 witness is heavy and runs on the lab.

## 7. Out of scope, recorded (R17)

- Production startup wiring: `StartupServiceLifecycleOwner.ensureOwners`
  (`startup-service-lifecycle-owner.js:27`) constructs the manager; the
  activation quest adds the one call `recoverRetainedCreations(await
  manager.inventoryRetainedCreations())` after the handler exists and before
  the transport address is registered (charter item 13), and the cross-node
  wake (R19).
- Timer owner: `TimerManager.reconstructTimers` idempotence (B-N2).
- Tombstoned-path cleanup and slot reuse (A-D2-2).
- Journal-first custody for every CREATE decision (RV7.4): the inventory is
  journal-first at restart; in-process decisions keep the memo cache (the
  custody table) until the activation quest measures the cost of a per-CREATE
  journal read.
- `storage` in the by-path tombstone identity (F-R1): the restart-scan
  retirement defined here uses the derived five-field identity (D2'
  `DERIVED_IDENTITY_FIELDS`); `storage` is read from the file when present and
  compared, never required.

---

# Revision 1 (lead, 2026-10-17, after the independent vet)

Vet: `evidence/design-vets-20261017/design-vet-recovery-20261017.md`, verdict
REVISE (blocking B1-B4, required R1-R16, recorded N1-N9). Nothing in the draft
is rewritten; the clauses below supersede the named draft clauses. Line
numbers are the vet's (lane tip `381750de2`).

## Superseded draft clauses

- D-R2 "a new manager method `inventoryRetainedCreations()` ... `localPhase`
  read BY PATH" and its STORAGE_MISSING definition: superseded by R1-A/R1-B
  (the manager owns the journal half only; the local half is the opening
  module's by-path reader through the lifecycle; `isCreationOnlyDatabase` is
  not the predicate).
- D-R3 "ONE bound REMOVE re-drive (`routeBoundRemoval` by the creation's id)
  for RETIRED" and "outcomes are emitted under the creation's id exactly as a
  wake-driven re-entry" for the REMOVE half: superseded by R1-E (the restart
  re-drive answers no request; it emits nothing).
- D-R4 in full (the UNCONFIRMED path, `openServingState(local = PUBLISHED,
  metadata = GRANT_UNCONFIRMED)` answering SERVING, "CREATE_ACTIVE with
  `grantConfirmation` in the detail", "re-confirms on its existing keyed run
  (wake or cadence)", "RELEASING or CLOSED -> `retireReplica` by token" at
  re-confirmation, "ADMITTED -> serving fenced HELD"): superseded by R1-C.
- D-R6 "order: CLOSED CAS -> endpoint removal -> STOPPED projection -> rows
  COMPLETED", "together with the STOP row", and the typed-edge row "metadata
  RELEASING/CLOSED at reopen ... retire by token by path": superseded by
  R1-D and R1-F.
- D-R8 "no new allocation": superseded by R1-G.
- D-R9 "STORAGE_MISSING, CORRUPT, MISMATCH -> permanent FAILED memo" as the
  inventory's own classification, and `NOT_READY` without a carrier:
  superseded by R1-B and R1-H.
- Section 6 P-R2 ("rows re-marked ALREADY_PRESENT"), P-R5 ("J's wake
  delivered"), P-R7 (its order), P-R8 (its REMOVE after restart), P-R10 (one
  host), and the mutation "re-drive order changed": superseded by R1-I.

## R1-A Owners of the inventory (B4, R14, R15)

The restart scan has ONE entry point, the manager's `recoverPendingOperations`
(`service-lifecycle-recovery.js:312-332` over `_readRecoverableOperations
:521-543`). For a consensus creation row it no longer calls
`recoverConsensusCreation`: it answers the row's JOURNAL half as a typed
inventory entry `{status: INVENTORIED, operationId, intent, token | null,
rowState, opening: opening_json | null, nodeId}` (the node from
`intent.consensusSlotRequest.nodeId`; `rowState` PENDING or IN_PROGRESS;
COMPLETED/FAILED rows are not recoverable and are not entries). The manager
performs no metadata read, no reservation and no physical effect; it reads
no local file (it has neither data directory nor node id, `:64-94`).

The LOCAL half is the opening module's: a new by-path reader
`inspectWasmCreationLocal(dbPath, identity)` in `wasm-creation-opening.js`
opens the file read-only (`readonly: true`, no schema creation, no WAL
checkpoint), reads root and local record through the existing
`readWasmCreationBinding`/`readWasmCreationLocal`, compares the SEVEN
identity fields including `storage` and `opening` (`IDENTITY_FIELDS`, D2';
R4) and answers one of: `ABSENT_UNCLAIMED` (no file, `opening === null`),
`ABSENT_CLAIMED` (no file or no tables, `opening !== null`: the recorded
first-opening-claim/file gap, R5), `ADMITTED`, `PUBLISHED`, `RETIRED`,
`CORRUPT_STATE`, `CONTENT_CONFLICT` (identity, root or `storage` mismatch: a
copied or replaced file). `WasmServiceLifecycle.inspectLocalCreation(creation)`
derives the path (`getWasmServiceDbPath`) and identity (`wasmCreationLocalIdentity`
shape from the intent/token) and calls it; the driver and runtime expose it as
the adapter operation `inspectRetainedCreation(owned)` (no physical effect).

The handler composes: `recoverRetainedCreations()` = manager entries filtered
to `nodeId === this.nodeId` (R7: a shared journal lists every node's rows),
each completed with the adapter's local answer. One decision site for local
permission remains the opening module (R1-C).

## R1-B The four refusals reach the handler typed and permanent (B3, B4-contract)

The open's typed refusal (`ServiceInstanceContractError.outcome`:
`CREATION_STORAGE_MISSING`, `CORRUPT_STATE`, `CONTENT_CONFLICT`,
`UNAVAILABLE`, `RESOURCE_CLOSED`, `CREATION_RETIRED`) flows unchanged:
`startReplica :378-381` reads `cause.outcome ?? cause.code` (today it reads
`.code` only and falls to `CONSENSUS_START_REFUSED`); `projectBoundStart :58`
carries it as the driver's FAILED result `{status: FAILED, outcome}`;
`confirmConsensusBootstrapResult :60-66` returns a typed FAILED
`{outcome: CONSENSUS_BOOTSTRAP.REFUSED, reason}` instead of throwing one code;
`continueRetainedCreation :160-166` returns it (not `UNKNOWN{...}`); the
handler's `RESUME_OUTCOME` maps `CREATION_STORAGE_MISSING`, `CORRUPT_STATE`,
`CONTENT_CONFLICT`, `RESOURCE_CLOSED`, `CREATION_RETIRED` to the PERMANENT
FAILED decision (RV7.1: no `deferRetry`, memo named) and `UNAVAILABLE` to the
deferral (RV3.2). The inventory's local answer is NOT itself the memo's
status: every entry is re-entered once (R1-E) and the re-entry's typed answer
writes the memo through the one writer (RV6.1). A REMOVE of a permanently
refused creation routes bound by the memo's id: `CREATION_STORAGE_MISSING` ->
tombstone answers STORAGE_MISSING, CLOSED is allowed (D2'); `CONTENT_CONFLICT`
-> REMOVE_FAILED typed, no tombstone inferred (B4); `CORRUPT_STATE` ->
`tombstoneByPath :84-86` REFUSED -> REMOVE_HELD today: ruled PERMANENT
(`CORRUPT_STATE` joins `PERMANENT_RETIREMENT_REFUSALS`; a corrupt local file
is an operator matter, never a re-drive) (N5).

## R1-C The unconfirmed grant and the pre-formation reopen: one owner, one release path (B1, R2, R8)

1. **Manager.** `resolveRetainedAdmission :160-174`: an owner answer
   `UNAVAILABLE` (the owner's `readState` UNAVAILABLE outcome, or a thrown
   owner read, both caught at one site: the UNAVAILABLE class, R8) is passed
   through as `ADMISSION_TENTATIVE {intent, token, metadataPhase: UNAVAILABLE}`
   instead of `{UNKNOWN, UNAVAILABLE}`; the manager decides nothing about the
   local record. `continueRetainedCreation :143` continues on TENTATIVE as on
   ADMISSION (STARTING, adapter create/start).
2. **Opening module (the local-permission owner).** `resolveWasmCreationAdmission
   :215-237`: with a TENTATIVE admission it reads the local record BY PATH
   (R1-A reader) before any open: local `PUBLISHED` with matching identity ->
   the metadata phase is the typed `GRANT_UNCONFIRMED`, the opening claim is
   skipped (a PUBLISHED record proves the first use was claimed), the open
   proceeds RETAINED; any other local answer -> the typed `UNAVAILABLE`
   refusal (deferral at the handler). With a reachable owner the clause is
   D2' unchanged, except: metadata `ADMITTED` with local `PUBLISHED` (a local
   grant written after the authoritative CAS cannot precede it) is refused
   `CORRUPT_STATE` (permanent, fail closed; a REMOVE retires by path). This
   supersedes D2' :451-452 ("metadata ADMITTED with local PUBLISHED is HELD")
   and today's `openServingState :54-58`; N2-B of the stage-1 design is read
   with it.
3. **Serving state.** `openServingState(local, metadata)`: `PUBLISHED` +
   `PUBLISHED` -> SERVING (D2'); `PUBLISHED` + `GRANT_UNCONFIRMED` -> SERVING
   with `grantConfirmation: UNCONFIRMED` on the replica (the local grant is the
   permission, B1); everything else HELD. `enableServing :146-153` is
   unaffected. `isServing` is unchanged (serving is admitted; B1's safety
   argument: J serves only after I's local RETIRED exists).
4. **Lifecycle answer.** `boundStartResult :105-115` answers the new
   `CONSENSUS_BOOTSTRAP.PUBLISHED_UNCONFIRMED` member for a serving replica
   whose `grantConfirmation` is UNCONFIRMED (never PUBLISHED, never HELD).
5. **Authority confirmation (the ONE confirmation site).** `confirmPublishedAuthority
   :114-137` consumes it as it consumes PUBLISHED_UNPROJECTED (RV4.1): owner
   PUBLISHED for the exact token -> CONFIRMED: the result becomes PUBLISHED
   and the ordinary projection/mark path runs (the replica is already
   serving; `grantConfirmation` -> CONFIRMED); owner RELEASING/CLOSED ->
   CONTRADICTED -> the existing branch retires by creation
   (`CONTRADICTING_OUTCOMES :73-74`); owner UNAVAILABLE -> UNRESOLVED keeps
   `PUBLISHED_UNCONFIRMED` typed and unchanged (manager state STARTING).
6. **Handler.** `PUBLISHED_UNCONFIRMED` maps to the HELD decision (memo HELD,
   `CREATE_HELD` at CREATING; the authority has not confirmed, so the
   coordinator sees HELD although the node serves on its local grant: the
   honest statement, RV3.2). The memo stays re-enterable (custody table).
7. **The release path (no cadence exists; the vet's P-R2/D-R4 window).** A
   bound instance that opened RETAINED and is not yet CONFIRMED-and-PUBLISHED
   at the handler (HELD after reopen before the group re-forms, or SERVING
   UNCONFIRMED) keeps its native subscriptions bound (`openReplicaResources
   :129` binds for `servingState !== SERVING` today; the rule becomes "binds
   until the first confirming run", `admitsNativeWake :44-46` accordingly).
   The first keyed run that observes committed founding membership
   (`progressWasmCreationGenesis :41-61`) fires exactly ONE OBSERVED wake
   (`publish :98` no longer suppresses it when the instance reopened
   RETAINED: the suppression `waited || !flipped` is for in-process genesis
   where the START's own result carries the news), then unbinds. The wake
   re-enters the HELD memo (RV5.3) -> resume -> owner reachable -> PUBLISHED
   -> CONFIRMED -> ACTIVE memo, rows projected, `CREATE_ACTIVE` under the
   creation id. If the owner is still UNAVAILABLE the re-entry answers
   `PUBLISHED_UNCONFIRMED` again (HELD) and the subscription stays bound for
   the next observation; no loop, no timer: progress is event-driven by the
   group and by the coordinator's dispatch.
8. **I selected offline.** B1 "Reconciliation later closes I" is the
   coordinator's REMOVE dispatch, never the node's own retirement: a reopen
   that observes RELEASING/CLOSED is refused `RESOURCE_CLOSED` -> permanent
   FAILED memo (RV7.1) -> the next REMOVE retires by path (D4'), closes, and
   completes the row (R1-D). The draft's "retire by token at reopen" has no
   owner and is withdrawn (R2).

## R1-D The retirement order, as implemented and accepted; crash analysis redone (B2)

The order is `withdrawRetiredConsensus :117-128`: (1) endpoint removal by
physical id, (2) `driver.stop` = fence (STOPPING, user admission closed) ->
RELEASING (non-blocking) -> tombstone (local RETIRED, durable) -> CLOSED CAS,
(3) STOPPED projection on `closed === true`, (4) NEW: the creation row
completes (one CAS, `transitionOperation :127-176`) in `retireConsensusCreation
:101-103` after `closed === true` and the STOPPED projection returned. No STOP
row exists for a bound retirement (`stopReplica :423-429` ->
`retireConsensusCreation :92-110`); the draft's "STOP row" is withdrawn. The
witness C6-7 (`bound-creation-handler-embedding.integration.test.js:205-213`,
`endpointDelete < closed < rowDelete`) stands. Crash points and recovery:

| Crash after | Durable state | Recovery |
|---|---|---|
| (1) endpoint removed | local PUBLISHED, metadata PUBLISHED, no endpoint row | reopen SERVING (R1-C); the re-projection writes the endpoint at the NEW boot incarnation (`writeRuntimeReplicaServicesRow :183-203` UPDATE-first; writer refreshes an older incarnation `:275-278`) |
| fence + RELEASING, before the tombstone | local PUBLISHED/ADMITTED, metadata RELEASING | reopen refused `RESOURCE_CLOSED` -> permanent FAILED memo -> next REMOVE retires by path, CLOSED, STOPPED, row COMPLETED (R1-C 8) |
| tombstone written, CLOSED not | local RETIRED, metadata RELEASING | inventory RETIRED -> re-drive (R1-E): ALREADY tombstone, CLOSED CAS, STOPPED, row COMPLETED |
| CLOSED written, STOPPED not | local RETIRED, metadata CLOSED, services row present | re-drive: CLOSED monotonic (`service-instance-state.js:277`), STOPPED projected, row COMPLETED |
| STOPPED written, row not COMPLETED | local RETIRED, metadata CLOSED, no rows | re-drive: every step idempotent, row COMPLETED |
| row COMPLETED | terminal | not an inventory entry (R1-A) |

## R1-E The restart re-drive of a RETIRED creation emits nothing (R6)

A restart re-drive answers no request: it registers an in-flight REMOVE entry
for the replica (so `hasInProgressReplicaRemoval :506-516` and the custody
table see it), writes the memo REMOVING, runs `retireConsensusCreation` by
the creation's id (journal-only read -> token), and on `closed === true` sets
the memo REMOVED (row COMPLETED by R1-D); on `closed === false` it leaves the
memo REMOVING for the next REMOVE or re-drive. It emits NO executor outcome
(a REMOVE outcome names a REMOVE workflow row, `EXECUTOR_OUTCOME_ACTION_MAP
:114-119`; the creation id addresses the ADD row). The CREATE re-entries of
R1-A entries (ABSENT_UNCLAIMED, ABSENT_CLAIMED, ADMITTED, PUBLISHED,
CORRUPT_STATE, CONTENT_CONFLICT) emit under the creation's id as RV5.1.

## R1-F Boot incarnation and discovery rows after a restart (R9, R17)

`restartHost(slot)` bumps the boot incarnation (the fixture fixes one per
slot at `:235` today); the reopened replica re-projects its endpoint at the
new incarnation (UPDATE-first), so the stale row is replaced, not duplicated.
The remover deletes only at the exact incarnation
(`runtime-endpoint-publication-wiring.js:157-170`; authority header `:30-33`):
a REMOVE that arrives BEFORE the re-entry re-projected leaves the old
incarnation's row, which the production endpoint-currentness sweep retires
(activation quest; R17 recorded). P-R2's expectation is corrected: PRESENT
(the latch is per instance, `markServicesRowPresent :99-107`) and exactly one
role write, never ALREADY_PRESENT.

## R1-G PENDING rows (R10)

A PENDING row's re-entry resolves the SAME request: an applied-but-unanswered
reservation is found (no second allocation); a never-applied one is applied
now (this IS the allocation the request asked for; "no new allocation" meant
"no allocation under a different request"). A REMOVE of a PENDING creation
(`NOT_ADMITTED -> REMOVE_COMPLETED`, RV3.3) terminates the row typed
(`FAILED`, reason `REMOVED_BEFORE_ADMISSION`, one CAS at the manager) so a
restart never re-enters a founder the coordinator considers removed; RV3.3's
row is amended ("the PENDING row left to the recovery stage" resolved).

## R1-H Readiness and process custody (R13, R14)

The handler's `ready` latch: `handleMessage :200-220` refuses every message
before the inventory is applied with the typed reply `NOT_READY`,
`deferRetry: true` (the honest statement of RV3.2: the producer retries; no
outcome is emitted). The embedding's `dispatch` (`:267-271`) refuses before
`ready` as production will (charter item 13 registers the transport address
after `ready`). Ordering: data-directory owner acquired -> journal half ->
local half -> memos -> `ready` -> re-entries scheduled. Witness: a second
process (or a second composition in the same process) cannot run the
inventory while the owner lock is held (`acquireDataDirectoryProcessOwner`
refuses); a failed startup cleanup keeps the lock and the inventory is not
applied (the PROCESS-CUSTODY acceptance's ledger owns the release; the
embedding acquires the owner directly today: the witness goes through the
ledger path once, labelled).

## R1-I Proof plan, corrected and extended (R5, R7, R9-R13, R16)

Every witness names which restart it models: `host` (handler + lifecycle +
runtime + manager rebuilt, process alive: same-process teardown proves memo
loss, record/journal survival and re-acquisition; it cannot prove
un-checkpointed WAL recovery, death mid-CAS or raft-rs mid-Ready state) or
`process` (C9: only the child-process witness proves those).

| Id | Witness (restart kind) | Red mechanism |
|---|---|---|
| P-R1 | host: HELD before restart, `ABSENT_UNCLAIMED`; memo HELD; one re-entry under the creation id; REMOVE afterwards bound and completes | NOT_FOUND today |
| P-R1b | host: crash between the opening claim and the file (`ABSENT_CLAIMED`): re-entry answers permanent `CREATION_STORAGE_MISSING` typed; no FRESH re-open; REMOVE closes the slot | B3/R5 |
| P-R2 | host, owner reachable, re-entry BEFORE re-formation: HELD; the first confirming run fires one OBSERVED wake; re-entry -> PUBLISHED -> ACTIVE; rows PRESENT at the new incarnation, one role write; INIT count unchanged | R1-C 7 |
| P-R3 | host, owner UNAVAILABLE at reopen, local PUBLISHED: SERVING `grantConfirmation: UNCONFIRMED`, result `PUBLISHED_UNCONFIRMED`, memo HELD, `CREATE_HELD`; owner later PUBLISHED + one wake -> CONFIRMED -> ACTIVE; owner later RELEASING at the re-entry -> CONTRADICTED -> retired by creation | R1-C 1-7 |
| P-R3b | host, owner UNAVAILABLE, local ADMITTED or ABSENT: deferral, nothing opens; mutation "UNCONFIRMED for ADMITTED" reddens | R1-C 2 |
| P-R4 | host: local ADMITTED + metadata PUBLISHED (lost CAS reply): reopen HELD, re-grant idempotent, SERVING | D1' |
| P-R5 | host: retired-not-closed before restart: inventory RETIRED, memo REMOVING, in-flight REMOVE entry, re-drive CLOSED/STOPPED/row COMPLETED, NO outcome emitted; J is driven by its own re-entry in the embedding (no cross-node wake path exists here: honest) | R1-E, R12 |
| P-R6 | host: metadata RELEASING, crash before the tombstone: reopen refused `RESOURCE_CLOSED` permanent; next REMOVE retires by path, CLOSED, row COMPLETED | R1-C 8 |
| P-R7 | host: crash after each of the five steps of R1-D: re-drive idempotent; the order asserted = C6-7's | R1-D |
| P-R8 | in-process: COMPLETED creation row: CREATE re-entry TERMINAL permanent; REMOVE -> REMOVE_COMPLETED; after a host restart the same REMOVE is NOT_FOUND (memo gone, row excluded, services row deleted) and the coordinator treats the stop as satisfied: recorded as the honest answer | R1-D, R16 |
| P-R9 | host: `CORRUPT_STATE` / `CONTENT_CONFLICT` (copied file: seven-field mismatch incl. `storage`; mutation "five fields only" reddens) / `CREATION_STORAGE_MISSING`: permanent typed memo, no INIT, no tombstone inferred; REMOVE: closes (STORAGE_MISSING), REMOVE_FAILED typed (CONTENT_CONFLICT, CORRUPT_STATE) | R1-B, R4 |
| P-R10 | process (C9): the child runs ALL THREE hosts over a FILE-BACKED shared component DB, reaches local PUBLISHED on one host (durable observable read by the parent through a second connection), is SIGKILLed (recorded), the parent restarts that host over the same directory after re-forming the other two: same B, old INIT refused, serving confirmed; labelled actual child process evidence | R11 |
| P-R11 | host: message before `ready` -> `NOT_READY` + `deferRetry`; after `ready` normal; mutation "memo written after the re-entry is scheduled" reddens through an injected wake between the two | R1-H, R7 |
| P-R12 | host: PENDING row: re-entry resolves the same request (applied -> found; never applied -> applied now); REMOVE on PENDING terminates the row and a restart does not re-enter it (mutation reddens) | R1-G |
| P-R13 | host: two hosts restart over the shared journal: each inventory holds only its node's entries (mutation "filter removed" re-enters the other node's creation and reddens) | R7 |
| P-R14 | host: REMOVE racing the restart re-entry: the in-flight guard and the custody table (REMOVING vs HELD) answer per Revision 7; no second writer drops the creation link | R7 |
| P-R15 | process-custody: a second composition cannot run the inventory while the owner lock is held; a failed startup cleanup keeps the lock (through the ledger path, labelled) | R13 |

Mutations by mechanism: inventory reads metadata; re-entry under a scan id;
memo after re-entry (P-R11); UNCONFIRMED treated as CONFIRMED (P-R3's
RELEASING branch); UNCONFIRMED for a local ADMITTED record (P-R3b); creation
row completed at PUBLISHED (P-R2: re-entry TERMINAL); CLOSED redo skipped
(P-R5); tombstone inferred on STORAGE_MISSING (P-R9); five-field identity
(P-R9); node filter removed (P-R13); subscriptions unbound at reopen / wake
suppressed (P-R2); REMOVE outcome emitted by the re-drive (P-R5); PENDING row
left PENDING after REMOVE (P-R12). The impact-contracts pair
`runtime-service-bound-creation-route` is extended with the restart witness
(R16). Statics as RV5.7; lab: the changed cone at the snapshot; P-R10 on the
lab.

## R1-J Recorded (N1-N9, R1, R17)

- N1: B1's premise includes CLOSED on `CREATION_STORAGE_MISSING` (typed
  absence) and the `storage` inode guard against a reappearing copy.
- N2: C7 holds by construction (binding-first; `journaledIntent :207-220`).
- N3: a bound creation row is never FAILED today; `REMOVE_FAILED` for a FAILED
  row becomes reachable only through R1-G's typed termination.
- N4: a wake before `ready` cannot address a replica (no memo exists); the
  `NOT_READY` reply is for CREATE/REMOVE.
- N6: V-N21 (REMOVE-deferral memo lacks `deferRetry`) stays open for a later
  vocabulary pass.
- R1: contract B1's "without a live metadata quorum" is bounded: the restart
  inventory needs the creation JOURNAL; in the embedding the journal is
  component SQLite faulted independently of the metadata owner; in production
  `wasm_operations` is a routed system-table read, so a real quorum loss takes
  the inventory down before the local grant is consulted. The production
  journal reader under quorum loss is the activation quest's (charter item
  13; R17).
- R17: the endpoint-incarnation currentness sweep (production) and the
  production journal reader under quorum loss are the activation quest's.
- N9: statics at land as RV5.7.

---

# Revision 2 (lead, 2026-10-17, after the re-vet of Revision 1)

Re-vet: `evidence/design-vets-20261017/design-revet-recovery-r1-20261017.md`,
verdict REVISE (B1-B4 CLOSED in mechanism; new blocking B5, B6; required
R17-R27; recorded N10-N13). Appended; the clauses below supersede the named
Revision 1 sentences only.

## Superseded Revision 1 sentences

- R1-G "terminates the row typed (`FAILED`, reason `REMOVED_BEFORE_ADMISSION`,
  one CAS at the manager)": superseded by R2-A.
- R1-C 1 "passed through as `ADMISSION_TENTATIVE {intent, token, metadataPhase:
  UNAVAILABLE}`" and R1-C 2 "the opening claim is skipped (a PUBLISHED record
  proves the first use was claimed)": superseded by R2-B.
- R1-C 2 "any other local answer -> the typed `UNAVAILABLE` refusal (deferral
  at the handler)": superseded by R2-C.
- R1-C 7 "keeps its native subscriptions bound ... until the first confirming
  run" for the serving-unconfirmed case without an event filter: superseded by
  R2-D.
- R1-B "`confirmConsensusBootstrapResult :60-66` returns a typed FAILED
  `{outcome: CONSENSUS_BOOTSTRAP.REFUSED, reason}`": superseded by R2-E.
- P-R3's third clause, P-R10's and P-R2's wording, P-R12: superseded by R2-H.
- Section 7 / charter item 13's `inventoryRetainedCreations()`: superseded by
  R2-G (the entry point is `recoverPendingOperations`).

## R2-A A REMOVE of a PENDING creation resolves the reservation first (B5)

A PENDING row MAY hide an applied reservation whose reply was lost (RV3.3
F3); the slot's token then lives only in the owner's state row, and only
`admission_json` ever teaches the lifecycle a token. So `decideBoundRemoval`'s
NOT_ADMITTED branch no longer answers REMOVE_COMPLETED directly: the REMOVE
first resolves the reservation with the SAME request through the existing
idempotent `reserveAndRetain :138-159` (HANDOFF: a lost reservation response
is resolved with the same request): `ADMITTED` -> the token is persisted
(row IN_PROGRESS, `admission_json`) and the retirement runs normally
(tombstone answers `CREATION_STORAGE_MISSING`, CLOSED is allowed, STOPPED,
row COMPLETED per R1-D); a sealed refusal (the owner answers that no slot is
or can be admitted for this request) -> the row becomes `CANCELLED` with the
reason (`VALID_TRANSITIONS :26-30` allows PENDING -> CANCELLED; never
PENDING -> FAILED) and REMOVE_COMPLETED; `UNAVAILABLE`/`UNKNOWN` ->
REMOVE_HELD, the row stays PENDING, the memo REMOVING, the next REMOVE or
restart re-drive resolves again. A restart inventory entry whose row is
PENDING is re-entered as a CREATE (R1-A: it resolves the same request and
continues) exactly as before; a CANCELLED row is terminal and not an entry.
Readers of PENDING rows after this change (vet census): `_readRecoverableOperations
:521-543` (CANCELLED excluded), `retainedToken :118`, `prepareConsensusCreation
:194-201` (a producer retry on a CANCELLED row answers TERMINAL; the planner
mints a new creation: recorded for the activation quest), `recoverConsensusCreation
:221-234`, `claimConsensusCreationOpening :310-312`, `isConsensusCreationRow
:266-269`, `READ_DECISION :46-47`; none treats CANCELLED as live.

## R2-B No new admission outcome; the claim is never skipped (B6)

`resolveRetainedAdmission :160-174` keeps answering `ADMISSION_RETAINED`
(every capture site below the manager, `captureConsensusBootstrap :37-39, :46-47`,
requires and rewrites exactly that) and carries the owner's answer in the
existing `phase` field: `phase: UNAVAILABLE` when the owner read answered
UNAVAILABLE or threw (the UNAVAILABLE class, R8). `continueRetainedCreation`
continues on it as today. The opening module decides on ITS OWN owner read
(`resolveWasmCreationAdmission :220` reads the owner again; the manager's
phase is not consulted: one decision site): owner `UNAVAILABLE` -> by-path
local read (R1-A reader) -> local `PUBLISHED` with matching identity ->
metadata phase `GRANT_UNCONFIRMED`; the opening claim is NOT skipped: on a
claimed row `claimConsensusCreationOpening :314-317` is a journal read
(independent of the metadata owner) and stays the one source of
`replica.creationOpening` (`openWasmServiceDatabase :180, :191`,
`openWasmCreationRecords :275`, `wasmCreationLocalIdentity :198`).

## R2-C Reopen under an unreachable owner, by local phase (R25, R26)

With the owner UNAVAILABLE at the opening module's read, the by-path local
answer decides, honouring CONTRACT-R2 :156-165 ("prior ADMITTED-only local
state permits bootstrap recovery but no protected serving until the grant is
resolved"):

| local answer | decision |
|---|---|
| `PUBLISHED` | open RETAINED, SERVING `grantConfirmation: UNCONFIRMED` (R1-C 3-6) |
| `ADMITTED` | open RETAINED, HELD (bootstrap recovery, no serving); the grant waits for the owner; the lifecycle answers HELD, the handler memo HELD; formation liveness is preserved (two ADMITTED founders reopen beside the unconfirmed one) |
| `ABSENT_UNCLAIMED` | typed `UNAVAILABLE` refusal (a FRESH open needs the owner's ADMITTED and the claim): deferral |
| `ABSENT_CLAIMED` | permanent `CREATION_STORAGE_MISSING` |
| `RETIRED` | permanent `CREATION_RETIRED` |
| `CORRUPT_STATE` / `CONTENT_CONFLICT` | their own permanent codes |

Full (opening, file) classification of the by-path reader (N13): (`null`, no
file) -> `ABSENT_UNCLAIMED`; (`null`, file with zero tables) ->
`ABSENT_UNCLAIMED` (a legitimate FRESH precondition, `openWasmCreationRecords
:276`); (`null`, file with tables) -> `CONTENT_CONFLICT` (cannot arise);
(claimed, no file or zero tables) -> `ABSENT_CLAIMED`; (claimed, root+local
present, seven fields match) -> the record's phase; identity/root/`storage`
mismatch -> `CONTENT_CONFLICT`; unreadable record -> `CORRUPT_STATE`.

## R2-D The unconfirmed window is bounded (R17, R19)

A serving instance with `grantConfirmation: UNCONFIRMED` admits user writes
(`isServing :64-66`), and every committed write emits APPLIED_PROGRESS
(`WAKE_EVENTS :20-23`); admitting those while unconfirmed would run genesis,
a journal read and two owner reads per committed user write for as long as the
owner is down (retry-loops #5). Rule: while an instance is serving-unconfirmed
(or HELD after a RETAINED reopen before the first confirming run), it admits
ONLY formation events (LEADER, FOLLOWER, CANDIDATE, LEADER_CHANGE,
TERM_CHANGE); APPLIED_PROGRESS is not admitted until confirmed. A
`GRANT_HELD(UNAVAILABLE)` wake for a SERVING instance is RECORDED by the
handler and schedules no immediate re-entry (the custody table's IN_FLIGHT /
HELD rows are unchanged for non-serving memos); the next formation event or
the coordinator's dispatch re-enters. The `grantConfirmation` writer is the
publication run on GRANTED (the lifecycle's grant CAS answered PUBLISHED for
the exact token): it sets CONFIRMED on the instance and the per-instance
"confirmed in this process" latch that `admitsNativeWake :44-46` consults to
unbind; `boundStartResult` consumes it; `confirmPublishedAuthority` confirms
the OPERATION (A-B5): two observations, two questions, as D1'/D7' already
distinguish.

## R2-E One manager->handler refusal shape (R21, R22)

`confirmConsensusBootstrapResult :60-66` answers the refusal with the code AS
the outcome (`{outcome: <code>}`: `CREATION_STORAGE_MISSING`, `CORRUPT_STATE`,
`CONTENT_CONFLICT`, `RESOURCE_CLOSED`, `CREATION_RETIRED`, `UNAVAILABLE`),
never a wrapper member, so `decideResume :66-69` keys as today (UNAVAILABLE ->
deferral; the permanent codes -> permanent FAILED); the forged/mismatched
PUBLISHED refusal of A-B5 (P11) keeps its own distinct reason. Journal-side
corruption at the scan (`journaledIntent :207-220`, `retainedToken :115-131`
throw) is a typed entry `{status: INVENTORIED, operationId, outcome:
CORRUPT_STATE | CONTENT_CONFLICT}`; the scan loop (`:320-328`) is total (one
catch per row, never aborting the scan); such an entry's re-entry answers the
permanent code and a REMOVE of it is `REMOVE_FAILED` typed.

## R2-F Reader preconditions and adapter base (R24, N10, N11, N12)

The by-path reader opens with `readonly: true`; precondition: an existing or
creatable `-shm` beside the file (the data directory is writable, SQLite >=
3.22); the read-only connection is closed before any open of the same file.
`inspectRetainedCreation` is a verb on the `ServiceTypeAdapter` base
answering typed `UNSUPPORTED` on the partition and message-group adapters.
`NOT_READY` is the handler's existing ERROR reply shape with the code
`NOT_READY` (`'runtime_service_not_ready'`, owner
`runtime-service-handler-constants.js`, RV3.8) and `deferRetry: true`; no
outcome is emitted. The REMOVED branch (`handleRemoveReplica :645-657`)
answers a reply without an outcome: unchanged stage-1c behaviour, recorded.
`deleteRuntimeReplicaServicesRow :164-181` on an absent row must not answer
`success: false` (the implementer verifies; a finding if it does).

## R2-G Entry point and the production consequence (R23)

The restart scan's one entry point is `recoverPendingOperations`; charter item
13 is re-pointed to it (section 7's `inventoryRetainedCreations()` is
withdrawn). Consequence recorded for the activation quest: at production
startup the same scan re-runs GENERIC PENDING/IN_PROGRESS rows through their
adapters (`recoverOperationRow :96-135`), which no production path does
today; the activation quest decides whether that is wanted before wiring the
call.

## R2-H Proof plan corrections (R18, R20, R27)

- P-R3, third clause: owner RELEASING at the re-entry -> the manager's
  `resolveRetainedAdmission :171` answers RESOURCE_CLOSED -> permanent FAILED
  memo; the live unconfirmed replica serves until the coordinator's REMOVE
  (`retiringTarget :50-54`); CONTRADICTED retirement is reached only at the
  confirm site when the owner answers ADMITTED with a non-PUBLISHED phase
  (its own witness, P-R3d).
- P-R3c (new): serving-unconfirmed under a down owner, N committed user
  writes -> zero re-entries, zero journal reads; one formation event -> one
  run; mutation "APPLIED_PROGRESS admitted while unconfirmed" reddens.
- P-R2 asserts the endpoint row's incarnation equals the new boot incarnation.
- P-R10: the child runs all three hosts over the file-backed shared component
  DB; the parent restarts ALL THREE directories, re-forms, then asserts the
  killed host's same B, old INIT refused, serving confirmed.
- P-R12 rewritten per R2-A: PENDING + applied reservation (reply lost) +
  REMOVE -> token persisted, retired, CLOSED, row COMPLETED, no orphaned slot;
  PENDING + sealed refusal + REMOVE -> row CANCELLED, REMOVE_COMPLETED; PENDING
  + owner UNAVAILABLE + REMOVE -> REMOVE_HELD, row PENDING; restart re-enters
  a PENDING row and never a CANCELLED one; mutation "terminate without
  resolving" reddens (the orphaned ADMITTED slot fences J forever).
- P6a (`wasm-creation-publication.integration.test.js:536-558`, `:550`
  `subscriptions.length === 0` and `:553` `wakes.length === 0` right after a
  SERVING RETAINED reopen) is superseded by appending: after a RETAINED
  reopen the subscriptions stay bound until the first confirming run (R2-D);
  the implementer censuses every other SERVING-open subscription assertion
  and the landing decision names each superseded line.
- New mutations: "TENTATIVE as a new outcome" (CONTEXT_REQUIRED deferral
  instead of serving) reddens P-R3; "claim skipped" reddens the
  retained-bootstrap opening-identity witnesses.

---

# Revision 3 (lead, 2026-10-17, after the re-vet of Revision 2)

Re-vet: `evidence/design-vets-20261017/design-revet-recovery-r2-20261017.md`,
verdict REVISE (B5, B6 CLOSED; new blocking B7; required R28-R33; recorded
N14, N15). Appended; the clauses below supersede the named Revision 2
sentences only.

## Superseded Revision 2 sentences

- R2-D "it admits ONLY formation events (LEADER, FOLLOWER, CANDIDATE,
  LEADER_CHANGE, TERM_CHANGE); APPLIED_PROGRESS is not admitted until
  confirmed" and "the next formation event or the coordinator's dispatch
  re-enters": superseded by R3-A.
- R2-E "answers the refusal with the code AS the outcome (... `UNAVAILABLE`)":
  for `UNAVAILABLE` superseded by R3-B; the five permanent codes stand.
- R2-E "such an entry's re-entry answers the permanent code" for a
  journal-corrupt entry: split by R3-F.
- R1-D's TERMINAL-with-row-state mapping "COMPLETED -> REMOVE_COMPLETED,
  FAILED -> REMOVE_FAILED": extended by R3-D (CANCELLED).

## R3-A The unconfirmed window has an owned, timer-free continuation (B7)

The owner's return is not a raft event and a settled group emits no formation
events, so a filter that drops every APPLIED_PROGRESS starves the
confirmation. Rules, all at the reconciliation owner
(`wasm-creation-reconciliation.js`):

1. APPLIED_PROGRESS is filtered only once genesis has been OBSERVED on this
   instance in this process; while genesis is unobserved (the
   APPLICATION_NOT_COVERED sub-case of a HELD-after-RETAINED reopen,
   `observeMembership :53-55`, replay at port open
   `raft-rs-durable-store.js:21-23`) every APPLIED_PROGRESS is admitted, so
   the completing event is never dropped.
2. While the instance is serving-unconfirmed, every K-th APPLIED_PROGRESS is
   admitted (K = the named constant `UNCONFIRMED_RECONFIRM_EVERY_WRITES` at
   the reconciliation owner, R06; the count is per instance, in-process):
   one genesis read and one grant attempt per K committed writes while the
   owner is down, zero once confirmed. The confirming run fires its one
   OBSERVED wake (R1-C 7) and the latch unbinds.
3. Formation events stay admitted as before. A `GRANT_HELD(UNAVAILABLE)` wake
   for a SERVING instance is RECORDED by the handler with no immediate
   re-entry (R2-D stands for that sentence).
4. The production trigger that bounds the window from outside is the
   coordinator's dispatch under B9 (the activation quest); recorded.

## R3-B Post-retained unavailability is distinct from the unrouted row (R28)

`RESUME_OUTCOME` maps a bare `UNAVAILABLE` answer to UNROUTED because that is
the PRE-retained journal-read case (`routeRuntimeServiceCreate :186-191`
classifies the definition row). An open-time or confirm-time unavailability
of a RETAINED creation therefore keeps today's shape `{outcome: UNKNOWN,
reason: UNAVAILABLE}` (the one named exception, as `continueRetainedCreation`'s
catch already produces), which `decideResume` maps to the DEFERRED decision
with the memo NAMED and `deferRetry: true` (RV7.1). The five permanent codes
(`CREATION_STORAGE_MISSING`, `CORRUPT_STATE`, `CONTENT_CONFLICT`,
`RESOURCE_CLOSED`, `CREATION_RETIRED`) are the outcome itself (R2-E). The
witnesses pinning the two UNAVAILABLE rows
(`runtime-service-bound-route.test.js:234-243, :277-282, :311-314`) stand
(N15).

## R3-C The refusal code set is closed (R29)

`confirmConsensusBootstrapResult :60-66` passes through exactly the five
permanent codes as the outcome and `UNAVAILABLE` as `UNKNOWN{reason:
UNAVAILABLE}`; every other FAILED driver answer (lifecycle refusals
`REPLICA_LIVE`, `REPLICA_RETIRED`, `STOPPED_DURING_START`, the
`resolveStartRefusal :506-521` codes, and the A-B5 digest mismatch with its
own reason) keeps today's throw -> `UNKNOWN{CONSENSUS_SERVING_NOT_IMPLEMENTED}`
-> deferral. `startReplica :378-381` reading `cause.outcome ?? cause.code`
only feeds that whitelist. Witness: one transient lifecycle code
(`REPLICA_LIVE`) stays a deferral; `wasm-creation-publication.integration.test.js:675`
stands (N15).

## R3-D Repeated REMOVE after CANCELLED (R30)

`readRetainedCreation`'s TERMINAL answer carries the row state; the bound
REMOVE maps COMPLETED and CANCELLED to `REMOVE_COMPLETED` (idempotent) and
FAILED to `REMOVE_FAILED` typed (R1-D extended).

## R3-E The manager's REMOVE-time reservation resolution, named (R31, R32)

`ServiceLifecycleManager.resolveRetainedReservation(operationId)`: a journal
read of the PENDING row and the module-private `reserveAndRetain` with the
SAME request, WITHOUT `_enforceRuntimePolicy` (RV2.1: a REMOVE runs no
runtime policy). Answers `ADMITTED {intent, token}` (persisted), a sealed
refusal (-> CANCELLED by the manager in the same call), or
`UNAVAILABLE`/`UNKNOWN`. Crash window stated: token persisted, crash before
CLOSED -> durable facts are row IN_PROGRESS with admission, `opening_json`
null, no file, slot ADMITTED; the REMOVING memo was volatile; the restart
inventory answers `ABSENT_UNCLAIMED` -> CREATE re-entry -> FRESH open -> a
HELD founder for a replica the coordinator is removing. The owned continuation
is the coordinator's REMOVE retry (no `REMOVE_COMPLETED` was ever emitted):
it finds the HELD named memo and retires it (P-R12c).

## R3-F Journal-corrupt entries, split (R33)

An entry whose intent is undecodable (`journaledIntent :207-220` threw) has
no replica identity: the scan records it as a typed entry `{status:
INVENTORIED, operationId, outcome: CORRUPT_STATE, reentry: false}`, the
handler logs it typed and schedules nothing (an operator matter). An entry
with a decodable intent and a corrupt admission (`retainedToken :115-131`
threw) is re-entered and answers `{outcome: CORRUPT_STATE}` -> permanent
named memo; a REMOVE of it is `REMOVE_FAILED` typed.

## R3-G Proof plan corrections (B7, R28-R32)

- P-R3: the owner's return is observed within K committed writes without any
  explicit re-entry; one OBSERVED wake; CONFIRMED -> ACTIVE. Mutation "K-th
  trigger removed" starves it (red).
- P-R3c: N committed writes under a down owner -> at most ceil(N/K) keyed
  runs, zero handler re-entries, zero journal reads outside those runs;
  mutation "filter removed" reddens.
- P-R3e (new): HELD-after-RETAINED reopen where the START ran before replay
  covered INIT: the completing APPLIED_PROGRESS is admitted (genesis
  unobserved) and the instance confirms; mutation "filter before genesis
  observed" reddens.
- P-R12c (new): token persisted by the REMOVE-time resolution, crash before
  CLOSED, restart: `ABSENT_UNCLAIMED` -> HELD founder; the REMOVE retry
  retires it (no orphan).
- Repeated REMOVE after CANCELLED -> `REMOVE_COMPLETED` (R3-D).
- Open-time UNAVAILABLE deferral is NAMED (memo keeps the creation,
  `deferRetry: true`) and distinct from the pre-retained UNROUTED row (R3-B);
  a transient lifecycle code stays a deferral (R3-C).
- Recorded N14: a HELD reopened founder that wins an election refuses
  forwarded writes typed, runs no leader effects, and the unconfirmed
  follower serves local reads only until the owner returns (safe, degraded,
  typed).

---

# Revision 4 (lead, 2026-10-17, after the re-vet of Revision 3)

Re-vet: `evidence/design-vets-20261017/design-revet-recovery-r3-20261017.md`,
verdict REVISE narrow (B7, R28-R33 CLOSED; required R35; precisions R34,
R36; recorded N16-N18). Appended; supersedes the named Revision 3 sentences.

## Superseded Revision 3 sentences

- R3-A rule 2 "While the instance is serving-unconfirmed, every K-th
  APPLIED_PROGRESS is admitted" and rule 3 "A `GRANT_HELD(UNAVAILABLE)` wake
  for a SERVING instance is RECORDED by the handler": superseded by R4-A.
- R3-A rule 4 as the only outer bound statement: extended by R4-B.

## R4-A The K-th bound and the recorded wake apply to every unconfirmed-under-UNAVAILABLE instance (R35)

Under R2-C a raft group may hold one serving-unconfirmed leader and two HELD
reopened founders (local ADMITTED, owner down); the followers apply every
user write the leader commits and would run genesis plus a grant attempt per
committed write, and each GRANT_HELD(UNAVAILABLE) wake would re-enter them at
the handler. Rules, widened:

1. The K-th admission (R3-A rule 2) applies to every instance whose genesis is
   OBSERVED in this process and whose LAST grant attempt answered UNAVAILABLE,
   HELD or serving alike; the predicate is the reconciliation owner's
   (`wasm-creation-reconciliation.js`), evaluated inside the synchronous
   subscription callback; the counter is per instance, in-process. An
   instance whose last grant attempt answered anything else keeps today's
   admission rule.
2. The handler RECORDS, without an immediate re-entry, every
   `GRANT_HELD` wake whose detail says `grant.outcome === UNAVAILABLE`
   (`wasm-creation-wake.js:29`, `publish :94`), for ANY memo state; it keys
   on the wake detail it receives, never on a serving state it cannot
   observe. The owner's return is re-observed by rule 1's K-th run, which on
   a HELD instance lands the grant and fires the OBSERVED wake (D1'/N7), and
   on a serving-unconfirmed instance confirms and fires its one OBSERVED
   wake (R1-C 7). Every other GRANT_HELD reason keeps the custody table's
   behaviour.
3. Witness P-R3f: two HELD reopened founders beside one serving-unconfirmed
   leader, N committed writes, owner down -> at most ceil(N/K) runs per
   follower, zero handler re-entries; owner back -> each follower grants
   within K writes, one OBSERVED wake each, three ACTIVE. Mutations: "K-th
   bound on serving instances only", "RECORDED on serving instances only".

## R4-B The quiet-group bound, stated (R34)

A group that commits fewer than K user writes after the owner returns admits
no event: no formation event, the GRANT_HELD wake already RECORDED, no
cadence (contract :143). Such a group confirms ONLY through the coordinator's
dispatch under B9 (production, the activation quest), an explicit re-entry
(embedding), a REMOVE, or a restart. Safety is intact meanwhile (the leader
serves on its durable grant, B1 :156-159; HELD founders serve nothing); the
cost is a stale projection and an ADD workflow parked HELD. Witness P-R3g:
owner back, fewer than K writes -> no confirmation until the explicit
re-entry; then CONFIRMED -> ACTIVE.

## R4-C UNRESOLVED at confirm, one mapping (R36)

`confirmPublishedAuthority :135` answering UNRESOLVED with UNAVAILABLE on a
plain PUBLISHED answer (owner reachable at open, unreachable at confirm) maps
to `PUBLISHED_UNCONFIRMED` (-> HELD at the handler), the same as on a
PUBLISHED_UNCONFIRMED answer (R1-C 5): one condition, one executor outcome.
`UNKNOWN{reason: UNAVAILABLE}` at the confirm site is then produced only for
non-serving answers. Witness: P-R3h.

## R4-D Recorded (N16-N18)

- N16: K's value is the reconciliation owner's, chosen at implementation and
  named with its reason.
- N17: `reason: UNAVAILABLE` from `continueRetainedCreation`'s catch means
  "deferred" (any non-contract error through `instanceFailure :107-109`), not
  "owner unavailable"; the deferral is named either way (R3-B).
- N18: `startReplica :378-381`'s diagnostic for a contract-error refusal
  changes from `consensus_start_refused` to the outcome string;
  `wasm-service-lifecycle.test.js:493` pins the old value: the implementer
  censuses and supersedes by appending; the landing decision names the line.

---

# Revision 5 (lead, 2026-10-17, after the re-vet of Revision 4): the record

Re-vet: `evidence/design-vets-20261017/design-revet-recovery-r4-20261017.md`,
verdict REVISE record-only (R34-R36 CLOSED; no mechanism finding remains;
required R37; recorded N19-N21). Appended.

## R5-A Committed witnesses this design supersedes, and their successors (R37; R09, R21)

The implementer appends the successor beside each line and never rewrites
the old one; the landing decision names each line (RV4.3 precedent).

| Committed witness | Pins today | Successor |
|---|---|---|
| `test/service/service-consensus-creation-intent.test.js:113-126` (`loseReservation()` + `prepare()`, then `recoverPendingOperations` asserts `status === 'held'`, `outcome === 'ADMISSION_RETAINED'`, row `in_progress`) | the SCAN resolves an applied-but-unanswered reservation (F3) | the scan answers `{status: INVENTORIED, rowState: PENDING, token: null}`, reserves nothing, the row stays PENDING; the RE-ENTRY resolves the same request (P-R12, the successor of this F3 claim) |
| `:222-230` (corrupt journal row through the scan asserts `status === 'held'`) | the scan re-enters a corrupt row | `{status: INVENTORIED, outcome: CORRUPT_STATE, reentry: false}` (R3-F) |
| `:232-239` (`recoverConsensusCreation` with `resolveInstanceResource -> UNAVAILABLE` asserts `{outcome: 'UNKNOWN', reason: 'UNAVAILABLE'}`) | the manager refuses on an unreachable owner | `ADMISSION_RETAINED` with `phase: UNAVAILABLE` (R2-B); the opening module decides on its own read |

Same clause: a `GRANT_HELD` wake whose detail is `grant.outcome === UNAVAILABLE`
sets no `wakePending` on an in-flight entry (`WAKE_ACTION` IN_FLIGHT,
`PENDING_WAKE_REASONS`): the pending-wake rule keys on reason AND detail, so
`releaseBoundCreation` schedules no re-entry for it (R4-A rule 2 complete).

## R5-B Recorded (N19-N21)

- N19 (stage-1 owner, R17): a SEALED-refused HELD follower (STALE_BINDING and
  the like) beside a serving leader re-drives per committed write until the
  coordinator's REMOVE; retiring subscriptions on a sealed refusal is a
  stage-1 change for its owner, not widened here.
- N20: a fully HELD group under a down owner (no user writes) confirms only
  through B9, an explicit re-entry, a REMOVE or a restart, as stage-1 P13
  recorded; R4-B covers it.
- N21: R4-C applies to every serving answer, PUBLISHED_UNPROJECTED included
  (`SERVING_STATUSES`, RV4.1).
