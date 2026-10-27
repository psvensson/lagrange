# Implementer brief, recovery stage UNIT 1: inventory, memo rebuild, typed refusals, retirement completion, PENDING resolution

Role. Implementer (Opus) of unit 1 of the recovery stage of Quest
`wasm-creation-genesis`. The lead designed; a Fable verifier re-measures; you
implement exactly the design. Never commit, stage, push, rebase, reset, clean
or stash; never bypass hooks or raise a baseline; never edit the design note
or the quest log (deviations = F-items in your report).

Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
on `work/rs-raft-event-reconciliation-20261016` at `381750de2` (the stage-1c
landing). Untracked lead documents exist (RECOVERY-DESIGN-20261017.md, charter
and plan edits, retained vet reports): leave them. Never touch
`/mnt/data/peter/projects/lagrange` or any other worktree; never run on lab
hosts. Heavy runs: `node scripts/checks/wait-for-thermal-headroom.js`, one at
a time, `npm run test:file -- <file>`, wait while another runner is active.

## Binding texts (read in full, latest revision wins)

`solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` (draft +
Revisions 1-5 and any later revision present; Revision 5 R5-A lists the three committed witnesses you must supersede by APPENDING successors, never rewriting), the six vet reports under
`evidence/design-vets-20261017/design-*recovery*`, `CONTRACT-R2.md` :146-200,
`HANDOFF-INTERFACES.md`, `ACTIVATION-DISCOVERY-DESIGN-20261017.md` RV2.1,
RV3.3, RV5-RV7 (the custody table), `SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md`
D2', D4', D6', and every source file the design's section 1 cites plus the
embedding fixture.

## Unit 1 scope (the design's clauses; unit 2 = R1-C/R2-D/R3-A/R4-A unconfirmed path and P-R10 C9)

A. **Inventory (R1-A, R2-E journal half, R2-G, R3-F).** `recoverPendingOperations`
   answers INVENTORIED entries for consensus creation rows (no metadata read,
   no reservation, no effect): `{status: INVENTORIED, operationId, intent,
   token | null, rowState, opening, nodeId}`; journal-side corruption -> typed
   entry (`outcome: CORRUPT_STATE | CONTENT_CONFLICT`, `reentry: false` when
   the intent is undecodable); the scan loop is total. COMPLETED/FAILED/
   CANCELLED rows are not entries.
B. **By-path local reader (R1-A, R2-C table, R2-F).** `inspectWasmCreationLocal(dbPath,
   identity)` in `wasm-creation-opening.js`: `readonly: true`, close before any
   open, seven-field identity incl. `storage` and `opening`; answers
   ABSENT_UNCLAIMED / ABSENT_CLAIMED / ADMITTED / PUBLISHED / RETIRED /
   CORRUPT_STATE / CONTENT_CONFLICT per the N13 table.
   `WasmServiceLifecycle.inspectLocalCreation(creation)`; driver and runtime
   expose `inspectRetainedCreation(owned)`; `ServiceTypeAdapter` base verb with
   typed UNSUPPORTED on partition/MG adapters (N11).
C. **Handler composition (R1-A, R1-H, R1-E, R2-F).** `recoverRetainedCreations()`:
   manager entries filtered to this node, completed with the adapter's local
   answer; memos written FIRST (HELD for ABSENT_UNCLAIMED/ABSENT_CLAIMED/
   ADMITTED/PUBLISHED, REMOVING for RETIRED; the typed refusals are NOT the
   memo's status: the re-entry's answer writes it through the one writer);
   `ready` latch; `NOT_READY` = existing ERROR shape + new code at the
   constants owner + `deferRetry: true`; the embedding's dispatch refuses
   before ready; ordering owner -> journal -> local -> memos -> ready ->
   re-entries. CREATE re-entries through `scheduleBoundReentry` under the
   creation id; the RETIRED re-drive registers an in-flight REMOVE entry,
   runs `retireConsensusCreation` by the creation id, sets REMOVED/REMOVING,
   emits NOTHING. The pending-wake rule keys on reason AND detail: a
   GRANT_HELD wake with `grant.outcome === UNAVAILABLE` is RECORDED for any
   memo and sets no `wakePending` on an in-flight entry (R4-A rule 2, R5-A).
D. **Typed refusals end to end (R1-B, R2-E, R3-B, R3-C).** `startReplica`
   reads `cause.outcome ?? cause.code`; the driver's FAILED result carries it;
   `confirmConsensusBootstrapResult` whitelists exactly CREATION_STORAGE_MISSING,
   CORRUPT_STATE, CONTENT_CONFLICT, RESOURCE_CLOSED, CREATION_RETIRED as the
   outcome and UNAVAILABLE as `UNKNOWN{reason: UNAVAILABLE}`; every other
   FAILED keeps today's throw; the handler maps the five to permanent FAILED
   (named, no deferRetry) and `UNKNOWN{UNAVAILABLE}` to DEFERRED named;
   CORRUPT_STATE joins PERMANENT_RETIREMENT_REFUSALS; census and supersede by
   appending `wasm-service-lifecycle.test.js:493` if it flips (N18).
E. **Retirement completion (R1-D, R3-D).** `retireConsensusCreation` completes
   the creation row after `closed === true` and the STOPPED projection (one
   CAS); `readRetainedCreation`'s TERMINAL answer carries the row state; bound
   REMOVE: COMPLETED/CANCELLED -> REMOVE_COMPLETED, FAILED -> REMOVE_FAILED.
   Verify `deleteRuntimeReplicaServicesRow` on an absent row (N10).
F. **PENDING rows (R2-A, R3-E).** `ServiceLifecycleManager.resolveRetainedReservation(operationId)`
   (journal read + module-private `reserveAndRetain`, no runtime policy;
   ADMITTED -> token persisted; sealed refusal -> CANCELLED in the same call;
   UNAVAILABLE/UNKNOWN passed through); the bound REMOVE's NOT_ADMITTED branch
   calls it first, then retires normally / answers REMOVE_COMPLETED on
   CANCELLED / REMOVE_HELD on UNAVAILABLE.
G. **Embedding (R1-F, R1-I).** `restartHost(slot)` (teardown, release the
   process owner, re-add over the same directory with a bumped boot
   incarnation, await `ready`); owner fault injection (UNAVAILABLE, RELEASING,
   CLOSED); journal write faults between retirement steps; every witness
   labelled `host` restart.

Witnesses of unit 1 (red first on 381750de2; new file
`test/wasm-service/bound-creation-restart.integration.test.js` + unit files
at the owners): P-R1, P-R1b, P-R4 (lost CAS reply reopen HELD -> re-grant ->
SERVING with the owner reachable), P-R5, P-R6, P-R7 (each of the five crash
points), P-R8 (in-process + the NOT_FOUND-after-restart record), P-R9,
P-R11, P-R12 (the three branches) + P-R12c, P-R13, P-R14, P-R15 (the
owner-lock half; the ledger-path cleanup-failure witness labelled), the
transient-code deferral (R3-C), the named open-time deferral distinct from
the UNROUTED row (R3-B), repeated REMOVE after CANCELLED (R3-D). Mutations
from the design's list for these cells, each killed and restored
byte-identically. Statics as RV5.7 (fast-static --base 381750de2, decision
boundaries 0 new, eslint, complexity/cognitive/literals/silent-catch scoped,
audit:shards, audit:impact-contracts with the pair extended, duplication and
unused ratchets vs base, `npm run test:metadata:refresh` at the end).
Changed-cone list -> scratchpad/reports/lab-selection-recovery-u1.txt.
Report -> scratchpad/reports/implementer-recovery-u1-report.md. Never claim
"done".

## Must not (the vets' lists, binding)

Introduce a new admission outcome value (ADMISSION_RETAINED carries `phase`);
skip the opening claim; terminate a PENDING row without resolving its
reservation first; write PENDING -> FAILED through `transitionOperation`
(sealed refusal -> CANCELLED); let an open-time UNAVAILABLE reach `decideResume`
as the pre-retained bare UNAVAILABLE; pass any lifecycle `.code` through as a
permanent outcome (whitelist of five + UNAVAILABLE-as-UNKNOWN); answer
REMOVE_FAILED for a repeated REMOVE of a CANCELLED row; emit a REMOVE outcome
from the restart re-drive; classify an ABSENT file as HELD without reading
`opening_json`; reuse the boot incarnation across `restartHost`; rewrite the
three superseded witnesses of R5-A in place; set `wakePending` for a GRANT_HELD
wake whose detail is UNAVAILABLE. Unit 2 (not yours): the GRANT_UNCONFIRMED
serving path, the K-th bound, P-R2/P-R3*/P-R10.
