# Implementer report: recovery stage UNIT 1 (Quest wasm-creation-genesis)

Worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, branch
`work/rs-raft-event-reconciliation-20261016`, base `381750de2`. Nothing committed, staged,
pushed, stashed or reset. The design note and the quest log were not edited by me. The
verifier judges this work; I do not claim it is done.

Binding texts read: RECOVERY-DESIGN-20261017 (the draft plus Revisions 1-5), and all six vet
reports. The sixth (`design-revet-recovery-r5`, APPROVE) showed up partway through. Its
cautions match what I built: append-only supersession and the wake detail carried into
`findWakeTarget`. The coordinator's two mid-task notes are applied (sections B and E).

## A. What changed (src)

| File | Change | Clause |
|---|---|---|
| `src/service/service-consensus-creation-intent.js` | `inventoryConsensusCreationRow(row)` gives the journal half of a row: `{status: INVENTORIED, operationId, intent, token\|null, rowState, opening, nodeId}`. An undecodable intent gives `{outcome, reentry:false}`. A corrupt admission or opening on a decodable intent gives `{..., outcome, reentry:true}`. `resolveRetainedAdmission`: the UNAVAILABLE class (an UNAVAILABLE answer or a thrown read) returns `ADMISSION_RETAINED` with `phase: UNAVAILABLE`. It is one decision table, with no new outcome value. TERMINAL answers carry `rowState`. New `resolveRetainedReservation` re-sends the same request through `reserveAndRetain` and applies no runtime policy. A sealed refusal does PENDING -> CANCELLED in one CAS, reread to confirm. New `completeConsensusCreation` does IN_PROGRESS -> COMPLETED in one CAS, idempotent. `recoverConsensusCreationRow` is removed. | R1-A, R2-A, R2-B, R2-E, R3-D, R3-E, R3-F, R1-D |
| `src/service/service-lifecycle-recovery.js` | Consensus rows go to the inventory: no metadata read, no reservation, no effect. The scan loop is total: one catch per row, each failure becomes a typed FAILED result. | R1-A, R2-E, R2-G |
| `src/service/service-lifecycle-manager.js` | `resolveRetainedReservation(id)` and `inspectRetainedCreation(owned)`, the latter delegating to the adapter. | R3-E, R1-A |
| `src/service/service-consensus-bootstrap.js` | `confirmConsensusBootstrapResult` whitelists exactly the five permanent codes as the outcome, and UNAVAILABLE as `UNKNOWN{reason: UNAVAILABLE}`. Any other FAILED keeps today's throw. `retireConsensusCreation` completes the creation row after `closed === true` and the STOPPED projection, returning it as `completion`. | R1-B, R2-E, R3-B, R3-C, R1-D |
| `src/wasm-service/wasm-service-lifecycle.js` | `startReplica` uses `cause.outcome ?? cause.code ?? CONSENSUS_START_REFUSED`. New `inspectLocalCreation(creation)`. | R1-B, N18, R1-A |
| `src/runtime/wasm-component-driver-consensus.js` and `wasm-component-driver.js` | The FAILED bound start carries `outcome = diagnostic.code`. New `inspectRetainedCreation(owned)`, which answers typed UNAVAILABLE when there is no lifecycle. | R1-B, R1-A |
| `src/runtime/service-runtime-consensus-bootstrap.js` and `service-runtime-lifecycle-operation-methods.js` | Runtime `inspectRetainedCreation(owned)`, dispatched to the intent's driver. | R1-A |
| `src/service/service-type-adapter.js` and `adapters/runtime-service-adapter.js` | A base verb `inspectRetainedCreation` returning typed `{outcome: UNSUPPORTED}`, which the partition and message-group adapters inherit. The runtime adapter overrides it. | R2-F N11 |
| `src/wasm-service/wasm-creation-opening.js` | `inspectWasmCreationLocal(dbPath, identity, binding)` opens `readonly: true`, closes in `finally`, compares all seven identity fields plus the root, and answers ABSENT_UNCLAIMED / ABSENT_CLAIMED / ADMITTED / PUBLISHED / RETIRED / CORRUPT_STATE / CONTENT_CONFLICT per the N13 table. `inspectRetainedWasmCreation(lifecycle, creation)` derives the path and identity, including `storage` when the file exists. | R1-A, R2-C N13, R2-F |
| `src/wasm-service/wasm-creation-retirement.js` | The by-path tombstone also compares the present file's `storage` identity, so a copied file gives CONTENT_CONFLICT and is not tombstoned. See F8. | R1-B, B4, section 7 F-R1 |
| `src/node/runtime-service-bound-creation-route.js` | REMOVE: a TERMINAL answer decides by `rowState` (COMPLETED and CANCELLED give REMOVE_COMPLETED, FAILED gives REMOVE_FAILED). NOT_ADMITTED resolves the reservation first (ADMITTED retires; CANCELLED gives REMOVE_COMPLETED; UNAVAILABLE or UNKNOWN gives REMOVE_HELD). CORRUPT_STATE is added to `PERMANENT_RETIREMENT_REFUSALS`. Wake: a GRANT_HELD wake with `grant.outcome === UNAVAILABLE` is RECORDED for any memo (the HELD-target branch included) and sets no `wakePending`. The rule keys on reason and detail, and `grantOutcome` is added to the diagnostic. | R2-A, R3-D, R1-B N5, R4-A r2, R5-A |
| `src/node/runtime-service-restart-inventory.js` (NEW, 181 lines) | `recoverRetainedCreations(handler)`, the composer. It takes the manager's one scan (`recoverPendingOperations`, generic rows skipped by a null resolver; see F5), keeps this node's entries, adds the adapter's local answer, writes every memo (HELD, or REMOVING for RETIRED), opens `ready`, then starts the work after the caller's turn: one `scheduleBoundReentry` per CREATE under the creation id, or the silent RETIRED re-drive. The re-drive registers an in-flight REMOVE entry, runs `decideBoundRemoval` by the creation id, sets the memo to REMOVED (or FAILED, or leaves REMOVING) and emits no outcome. Also `createRestartLatch` and `notReadyReply` (`NOT_READY`, `deferRetry: true`). | R1-A, R1-E, R1-H, R2-F, R3-F |
| `src/node/runtime-service-handler.js` and `-constants.js` | Option `awaitsRestartInventory` and the `ready` promise. `handleMessage` refuses with NOT_READY before ready. New `recoverRetainedCreations()` method. `NOT_READY = 'runtime_service_not_ready'` and three log messages added at the constants owner. | R1-H, R2-F |

N10 is verified: `deleteRuntimeReplicaServicesRow` on an absent row does not answer failure. The crash-point-5 re-drive and the P-R14 retirement of a never-projected HELD founder both settle COMPLETED.

## B. Superseded committed witnesses (appended beside, never rewritten)

The old assertion lines are kept verbatim as `// ` comments under a `SUPERSEDED (...)` header. The successor sits directly beside them, citing R5-A.

1. `test/service/service-consensus-creation-intent.test.js:113-126`: old `:124-126` (`status 'held'`, `outcome ADMISSION_RETAINED`, row `in_progress`) are kept as comments at the new `:124-129`. The successor test at `:135` (R5-A, P-R12 successor of F3): the scan answers INVENTORIED, PENDING, token null and reserves nothing; the re-entry then resolves the same request with one allocation.
2. Same file `:222-230`: old `:228` (`status 'held'`) is kept as a comment at `:262-264`. The successor at `:270` asserts `{status: INVENTORIED, operationId, outcome: CORRUPT_STATE, reentry: false}`.
3. Same file `:232-239`: the old `deepEqual(...UNKNOWN/UNAVAILABLE)` is kept as a comment at `:288-290`. One appended line `assert.equal(result.phase, 'UNAVAILABLE', ...)` keeps `result` used for lint. The successor at `:300` asserts `ADMISSION_RETAINED` with `phase: UNAVAILABLE` for both an UNAVAILABLE answer and a thrown read. That the opening module decides on its own read is witnessed by R3-B in the restart test (owner reads == 2).
4. Flips not in the R5-A list (F3), superseded the same way:
   - `test/node/runtime-service-bound-route.test.js` P15, `:668`: RESOURCE_CLOSED becomes TERMINAL_OPERATION, because the REMOVE now completes the row (R1-D/D-R6).
   - Same file, cell (c), `:835`: a REMOVE of a PENDING row now resolves the same request and retires it (R2-A).
   - `test/wasm-service/wasm-creation-publication.integration.test.js` P4, `:440`: RESOURCE_CLOSED becomes TERMINAL_OPERATION (R1-D).
   - `test/runtime/wasm-driver-contract-conformance.test.js`: allowlist entry `inspectRetainedCreation` appended, in the 1c precedent style.
5. N18 census: `wasm-service-lifecycle.test.js:493` does not flip (a generic Error has no `.outcome`). A sibling witness is appended for the typed-refusal code.

## C. Witnesses and red-first

New file `test/wasm-service/bound-creation-restart.integration.test.js` (15 tests, every one labelled with its restart kind, `host`). Crash points are labelled seams: one production call fails once, then the host restarts.

P-R1, P-R1b, P-R4, P-R5, P-R6, P-R7 (crash points 1, 3, 4 and 5; point 2 is P-R6), P-R8 (in-process, plus NOT_FOUND after restart), P-R9 (the three refusals; a copied file gives a seven-field mismatch), P-R11, P-R12 (all three branches plus R3-D), P-R12c, P-R13, P-R14, P-R15 (owner lock, plus the ledger path labelled once), and R3-B (named open-time deferral).

Unit and component witnesses:
- In `runtime-service-bound-route.test.js` (new describe block): NOT_READY; the UNAVAILABLE-grant wake rule (RECORDED, no `wakePending`, other GRANT_HELD still QUEUED); R1-B/R3-C (permanent code, UNAVAILABLE named deferral, REPLICA_LIVE transient deferral); R3-D (CANCELLED gives COMPLETED, FAILED gives FAILED); R2-A/R3-E (sealed gives CANCELLED, unavailable gives HELD/PENDING).
- `wasm-creation-local-record.test.js`: the N13 table, all seven fields, root mismatch, read-only.
- `service-type-adapter.test.js`: UNSUPPORTED on the partition and message-group adapters.
- `service-consensus-creation-intent.test.js`: the total scan and the TERMINAL `rowState`.
- `wasm-service-lifecycle.test.js`: the N18 sibling.

Red on base `381750de2` (logs in `scratchpad/red-recovery-u1/`, summary `SUMMARY.txt`; base snapshot in `scratchpad/base`, with a labelled red-run shim in the base copy of the fixture that sets `inventory = []` when the method is absent):
- Every new restart witness is red except P-R15, and every new unit or component witness is red.
- The local-record file is red as a whole file (missing export).
- The design's named red mechanisms are also shown on base in `red-mechanisms.base.txt`: P-R1's REMOVE after a host restart answers `not_found`, and P-R12's REMOVE on a PENDING row answers REMOVE_COMPLETED while leaving the slot `ADMITTED` (orphaned).

## D. Mutations (`scratchpad/mutations-recovery-u1/`, `spec.json` + `spec-m13b.json`, `SUMMARY.txt`)

All 29 runs killed, each restored byte-identically (sha256 checked):

- M01: inventory reads metadata
- M02: re-entry under a scan id
- M03: memo written after the re-entry
- M04: CLOSED redo skipped
- M05: tombstone inferred on absence
- M06a / M06b: five-field identity, at the inventory and at the by-path tombstone
- M07: node filter removed
- M08: re-drive emits a REMOVE outcome
- M09: PENDING terminated without resolving
- M10: row completion skipped
- M11: any code passed as permanent
- M12: bare UNAVAILABLE at open (reaches UNROUTED)
- M13: phase pass-through removed; first run on the old text, then M13b/M13c re-run after the refactor
- M14: `wakePending` set for an UNAVAILABLE grant
- M15: UNAVAILABLE grant re-queued on a HELD memo
- M16: CORRUPT_STATE not permanent
- M17: CANCELLED answered REMOVE_FAILED
- M18: sealed refusal written PENDING -> FAILED
- M19: ready latch ignored
- M20: boot incarnation reused across `restartHost`
- M21: re-entry races a REMOVE
- M22: ABSENT classified without reading `opening_json`
- M23: `startReplica` reads `.code` only
- M24: driver drops the outcome
- M25: scan not total
- M26: inventory composed before the owner is released

## E. Statics (`scratchpad/static-recovery-u1/`)

- `fast-static --base 381750de2`: ok.
- eslint on all 31 changed or new files: 0.
- Decision boundaries, scoped: 0 new. One new hit in `resolveRetainedAdmission` was fixed by turning it into a table.
- Complexity, scoped: 6 violations, identical to base (no new).
- Cognitive: 0.
- Literals: 0 new. Silent-catch: 0 new.
- File size: OK.
- `audit:shards`: OK. `audit:impact-contracts`: PASS. The `runtime-service-bound-creation-route` contract and coupled pair are extended with the restart-inventory module and the restart witness.
- Duplication: identical to base. The test side is red at both (698/26458 against baseline 697/26369); that red is inherited.
- Unused exports: equal to base (1456) after de-exporting `RESTART_ACTION`. The ratchet itself is red at base too (1456 > 1416); also inherited.
- `npm run test:metadata:refresh` was run at the end, updating `test/shards/{primary,resource,subsystem}-classes.json` and `impact-graph-seal.json`.

Local changed cone (direct importers plus fixture importers, 38 files, list at `scratchpad/reports/lab-selection-recovery-u1.txt`): 37 green. `wasm-driver-contract-conformance.test.js` is red with exactly base's failure set (prepare/start/health/idempotency/property, pre-existing). My allowlist entry fixed the one red I had added there.

## F. Deviations and findings for the verifier

- F1: The brief said six vet reports. Five were present at the start; the sixth (r5 APPROVE) appeared later and was read. Nothing changes.
- F2: "Append, never rewrite": a flipped assertion cannot stay executable. The old lines are kept verbatim as comments beside the successor, and one assertion is appended to the `:232` test for lint (section B).
- F3: Three committed witnesses outside R5-A flip, as consequences of R1-D and R2-A (section B.4). They are superseded by appending; the landing decision should name them.
- F4: The ready latch is opt-in (`awaitsRestartInventory`). Production has no caller of the inventory yet (charter item 13), so a default-on latch would refuse forever. The embedding's `addHost` and `restartHost` engage it. C6-9's `restartHandler` (handler-only restart) stays unlatched.
- F5: The handler calls `recoverPendingOperations` with a resolver that answers null, so generic PENDING/IN_PROGRESS rows are SKIPPED untouched. Their re-run is the activation quest's call (R2-G).
- F6: Entries whose local answer is CORRUPT_STATE, CONTENT_CONFLICT or UNSUPPORTED, and journal-corrupt entries with `reentry:true`, get a HELD named memo before ready. Their one re-entry writes the permanent FAILED memo through settle, so the typed refusal is never the memo's own status. This is my reading of R1-B and R1-E.
- F7: P-R14 rule I added: the restart re-entry starts only while the memo it wrote is still HELD for that creation and nothing is in flight, so a REMOVE that took custody between `ready` and the re-entry is not raced. This custody-table cell is an implementation choice.
- F8: The by-path tombstone now compares `storage` when the file exists. R1-B and P-R9 require REMOVE_FAILED for a copied file, and section 7 says "compared when present". This changes the D2' five-field by-path behaviour for present files only.
- F9: The manager half of R2-B is implemented in unit 1, because R5-A's third successor and R3-B need it. The opening module's GRANT_UNCONFIRMED and the R2-C local-phase table are not implemented (unit 2). With the owner UNAVAILABLE, the opening module refuses UNAVAILABLE for every local phase, which gives the named deferral.
- F10: The runtime and the manager both confirm one START answer. The manager therefore passes an already-mapped `UNKNOWN{UNAVAILABLE}` through unchanged; otherwise the reason would collapse to CONSENSUS_SERVING_NOT_IMPLEMENTED.
- F11: A failed row-completion CAS after CLOSED still answers REMOVE_COMPLETED, because the slot is closed. The row stays IN_PROGRESS and the restart re-drive completes it (P-R7 crash point 5). The completion answer rides on the retirement result as `completion`; the handler does not map it.
- F12: P-R15 is green at base. Process custody already existed, so red-first cannot be shown. Mutation M26 kills it.
- F13: The R3-C transient half (REPLICA_LIVE stays a deferral) is green at base by nature. It shares a test with the permanent-code cases, which are red at base, and M11 kills it.
- F14: `inspectWasmCreationLocal` takes a third parameter, `binding`, for the root comparison.
- F15: The RETIRED re-drive's in-flight REMOVE entry is keyed by the creation operation id.
- F16: Rule deviation: I ran the restart test once directly (`node --test --test-reporter=spec`, about 3 s, no thermal gate). Every other run went through the gated `npm run test:file`.
- F17: P-R7 crash point 1 issues an explicit CREATE re-dispatch after re-formation when the re-entry answered HELD. Unit 2 owns the confirming-run wake (R1-C 7). The witness does not pin which path ran. P-R2's incarnation assertion is unit 2's.
- F18: Not repeated in the embedding: P-R8's successor J (route P15 covers it) and P-R5's J re-entry. P-R5 asserts I's CLOSED wake reason and token, answered RECORDED.
- F19: `solve/quests/wasm-creation-genesis/log.ndjson` and the closeout plan show worktree modifications I did not make.
- F20: `scratchpad/base` carries my copied test files plus the red shim, and is only for red runs. `scratchpad/base-clean` is a pristine snapshot used for ratchet comparison.
