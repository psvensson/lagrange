# Verifier verdict, stage 1c round 3 (corrective; design Revision 5): narrow re-measurement

Independent adversarial verifier (Fable). Subject: `git diff 04f1a9112 9f83c7be3` minus the lead's documents (design
Revision 5, closeout plan, activation charter, the retained round-1 evidence under
`evidence/activation-discovery-20261017/verifier-1c-round1/`, the quest log). Read in
`/mnt/data/peter/projects/.worktrees/verify-1c` detached at `9f83c7be34e19e47feebe44a8daddee6030f4df1`
(`refs/heads/wip/rs-raft-serving-publication-4`; parent `04f1a9112` = my round-1 tree), after
`node scripts/generate-global-owner-debt-inventory.js --refresh-import-graph-only` (snapshotDigest
`0bae9c2c...`, identical to the committed seal: the tree stayed clean). Binding: Revisions 1-5 (latest wins), the
three stage-1c vet reports, my round-1 verdict. Hard rules kept: nothing committed, staged, pushed, reset, cleaned or
stashed; refs untouched (the only checkout actions were `git checkout -- test/shards/impact-graph-seal.json` to drop
the lead's round-1 refresh of a generated file so the detach could proceed, `git checkout --detach <sha>`, and the
byte-identical restores of my mutations); every run through `npm run test:file -- <file>` behind the thermal gate and
a no-other-runner guard, one at a time; no lab host touched.

## 0. Frozen delta claim (RV5.1-RV5.6, as the round-3 implementation states it)

RV5.1 `reenterHeldCreation(handler, existing, params)` resumes `existing.operationId` (the HELD memo's retained
creation), keys the in-flight guard by it (the key wakes use) and emits every re-entry outcome under it; the request's
id is only the log field `requestOperationId`; the reply stays IN_PROGRESS. RV5.2 a nameless settle (BOUND_ROUTE_REQUIRED,
UNAVAILABLE deferral, or the catch path before the resume answered a retained class) writes the memo only when the
current memo names no creation (`writesMemo`); the catch path names the request's id only after a retained-class
answer (`retainedAnswer`). RV5.3 `findWakeTarget` requires a string `token.operationId` (else NO_LOCAL_OPERATION);
`wakePending` is set only for GENESIS_OBSERVED / GRANT_HELD. RV5.4 after PRESENT a second mark for the own token
answers ALREADY_PRESENT and leaves `pendingRoleUpdate` untouched (lifecycle unit witness); C6 (h) asserts
`born >= 0`. RV5.5 the embedding fixture drops `held`, `phase`, `holdResponses`. RV5.6 one coupled pair
`runtime-service-bound-creation-route` (route module <-> consensus bootstrap + publication module; witness N) with a
contract of the same name. Everything else of stage 1c is unchanged and stands on the round-1 record.

## 1. Coverage of the touched cells (round-1 numbering; U = runtime-service-bound-route.test.js, N = C6 embedding, L = wasm-service-lifecycle.test.js, PROBE = r3/probes/facts.ndjson)

| # | Cell | Round 3 |
|---|---|---|
| 13 | duplicate CREATE while HELD, same id -> re-enter once, IN_PROGRESS, outcome under the creation | U (C6-3, F9); PROBE P9 |
| 14 | CREATE under another id while HELD -> memo keeps the creation, re-entered once under its id, outcome under the creation's id, next REMOVE bound | U RV5.1 (two tests); PROBE P1 class closed |
| 14b | wake during that re-entry -> RECORDED on the creation's in-flight entry, one resume at a time | U RV5.1 |
| 14c | CREATE under another id while the memo is REMOVING (closed:false, named) | PROBE P5 -> see findings |
| 14d | CREATE under another id while the memo is FAILED after a named deferral | PROBE P6 -> see findings |
| 14e | CREATE under another id while the memo is a NAMELESS HELD (only `registerExistingReplica` can make one) | PROBE P8 -> F-r3-2 judged below |
| 16 | CREATE while memo FAILED -> proceeds | TRACED (unchanged) |
| 18-19 | OBSERVED wake for HELD -> QUEUED; wake in flight -> RECORDED, consumed once | U (unchanged tests green) |
| 20 | wake naming no local operation | U C6-10 |
| 21-22 | wake for ACTIVE/FAILED memo; CLOSED wake for HELD/REMOVING memo -> RECORDED, no re-entry | TRACED (rows 4-5 of `findWakeTarget` unchanged) |
| 23 | CLOSED wake recorded on an in-flight CREATE -> no `wakePending`, no re-entry; GRANT_HELD does set it | U RV5.3; PROBE P3r |
| 25 | wake without token / non-string operationId -> NO_LOCAL_OPERATION | U RV5.3; PROBE P2r |
| 54 | re-drive that finds PRESENT replays nothing: the latch itself (ALREADY_PRESENT, `pendingRoleUpdate` untouched) | L (RV5.4); N (h) with `born >= 0` |
| - | nameless settle with a HELD memo (BOUND_ROUTE_REQUIRED) leaves it; emitter-fault catch path leaves it | U RV5.2 (two tests) |
| - | catch path before any answer when the resume itself throws | PROBE P7 |

## 2. Findings by category (round 3)

### V-F2 (REQUIRED; recovery-replay #1, owner-interaction #9; the V-F1 class in two further memo states) RV5.2 guards one memo-write site; the handler's "Track in-progress" write is a second one and still drops a creation-naming memo when its status is FAILED (named deferral) or REMOVING (closed:false)

- Mechanism: `src/node/runtime-service-handler.js:295-299` (unchanged in round 3) writes `{replicaId, entityId, status: CREATING}` unconditionally for every memo `replyToExistingReplica` lets through, i.e. statuses other than ACTIVE/HELD/CREATING: FAILED (the named deferral memo of RV3.2, `operationId` kept) and REMOVING (the REMOVE_HELD memo of RV2.1, `operationId` kept). The memo is now nameless, so `writesMemo` (`route.js:87`) answers true for the nameless settle that follows a `BOUND_ROUTE_REQUIRED`/UNAVAILABLE answer, and the creation link is gone before RV5.2's guard ever runs.
- Scenario -> wrong output, PROBE P5 (`r3/probes/facts.ndjson`): bound REMOVE answers closed:false -> memo `{removing, operationId: operation-0}`; a CREATE under `another-operation-id` is accepted INITIATED; the memo becomes `{status: failed}` with no `operationId`; CREATE_FAILED BOUND_ROUTE_REQUIRED is emitted under the request id; the next REMOVE routes GENERIC (no second bound stop) and answers REMOVE_FAILED (the manager's bound state is STOPPING, so the generic STOP transition is refused), slot ADMITTED in the probe (RELEASING in the real lifecycle): the half-retired bound replica can never be CLOSED through the handler; J stays `PREDECESSOR_OUTSTANDING`. PROBE P6: a named deferral memo `{failed, operationId: operation-0}`; a CREATE under another id -> memo `{status: failed}` nameless; the next REMOVE routes GENERIC (`stop {bound: false}`), answers REMOVE_COMPLETED, slot ADMITTED: the orphan of V-F1 again (a deferred creation whose replica may be bootstrapped locally, or serving after an UNRESOLVED-authority deferral, is orderly-stopped while its slot stays live).
- Why in scope: RV5.1's ruling "the node never depends on [the one-id premise] to keep custody of a live bound replica" and RV5.2's sentence "writes the replica's memo only when the current memo names no creation ... otherwise the memo is left as it is" are stated for the whole refusal path, and the brief asked for exactly this probe. The round-3 witnesses cover only the HELD memo; P5/P6 are the FAILED and REMOVING memos.
- Required change (minimal, node side; the lead chooses the shape): (a) `handleCreateReplica` must not overwrite a creation-naming memo with a nameless CREATING one - either leave the memo untouched and track the request only in `inProgressOperations` (the nameless settle then leaves it under RV5.2, a named settle for a request that IS a retained creation writes it), or carry `existing.operationId` into the CREATING write and have the nameless settle restore the prior status rather than write FAILED; (b) design-consistent alternative for the FAILED-named memo: a deferral is "re-enterable" (RV3.2), so a CREATE for it under any id re-enters the memo's creation exactly as the HELD memo does (`reenterHeldCreation`), and a CREATE for a REMOVING memo answers IN_PROGRESS/typed refusal without touching it. Witnesses: U "a CREATE under another id while the memo is REMOVING (closed:false) keeps the creation; the re-REMOVE is bound and completes" and "... while the memo is a named deferral keeps the creation; the next REMOVE is bound" (both red on 9f83c7be3 by P5/P6).

### V-N11 (recorded; F-r3-2) The nameless-HELD fallback `existing.operationId ?? params.operationId` is unreachable in production and should fail closed rather than resume the request
- Census: `RuntimeServiceHandler.registerExistingReplica` has no caller in `src/` (the three `registerExistingReplica` hits are the partition `ReplicaHandler`'s / `ReplicaLifecycleManager`'s); every HELD memo the route writes is named (`settleCreation` HELD only with `names: true`); `recoverLocalReplicaForRemoval` copies `row.status`, never 'held' (HELD is never projected). So a nameless HELD memo exists only through a test's `registerExistingReplica`. PROBE P8: with such a memo, the fallback resumes the request id -> BOUND_ROUTE_REQUIRED -> the nameless settle overwrites the memo (`operationId` undefined -> writes), reproducing the V-F1 shape in that corner. Recommendation: a HELD memo without `operationId` is a corrupt memo; refuse the request typed (ERROR reply) or treat it as absent explicitly, never resume the request's id under the HELD branch. Non-blocking (unreachable).

### V-N12 (recorded; F-r3-1, design text) `events` is read by the shared `deliverScheduled`/`record()` (`wasm-strong-write-native-fixture.js:37-38`); keeping it is correct; RV5.5's list ("held, events, phase, holdResponses") should drop `events`. `phase` is now recorded as undefined into that sink; harmless.
### V-N13 (recorded; F-r3-5, harness fidelity) The lifecycle latch witness assigns a stand-in `consensusCreation = {token}` to an unbound replica (servingState OPEN, no retained intent); the latch reads only `consensusCreation.token` and `servicesRow`, so the stand-in cannot mask its mechanism, and the row-level behaviour is N (h). Acceptable for a unit witness of the latch; a real bound creation would make the witness also cover `publishesServicesRow`'s bound branch (it does, incidentally: `consensusCreation !== null`).
### V-N14 (recorded; F-r3-4) The new contract `runtime-service-bound-creation-route` (owners: route, consensus bootstrap, publication module; tests U, N, P) with the pair of the same name (endpoints route <-> bootstrap+publication; witness N) is the right shape: the registry needs a contract per pair, and widening `service-consensus-retained-native-bootstrap` would have mixed the stage-1 native owners with the handler. `audit:impact-contracts` PASS 67/38; N is primary-classified integration.
### V-N15 (recorded) P3r: a GRANT_HELD wake recorded on an in-flight CREATE does set `wakePending` and yields exactly one re-entry after the HELD settle (2 bound starts with one GRANT_HELD wake); a CLOSED wake alone yields none (U RV5.3). Matches RV5.3.

Checked and sound: RV5.1 - the re-entry resumes `existing.operationId`, keys the in-flight entry by it, emits under it (U RV5.1 x2; PROBE P9 same-id duplicate emits CREATE_HELD under `operation-0`); RV5.2 - `writesMemo` is consulted by the one `settleCreation` writer and the catch path is nameless until a retained-class answer (U RV5.2 x2; PROBE P7: a resume that throws leaves the HELD memo and emits CREATE_FAILED + deferRetry under the request id); RV5.3 - `typeof operationId !== 'string'` is the first row (PROBE P2r: undefined, absent and numeric ids all NO_LOCAL_OPERATION); `PENDING_WAKE_REASONS` = {GENESIS_OBSERVED, GRANT_HELD}; RV5.4 - L witness + `born >= 0`; RV5.5 - fields dropped; the handler diff is the one call-site change.

## 3. Mutations (authored from mechanism, applied once, catcher gated, restored byte-identically; `r3/mutations/*.patch`, `*.result`, `*.sha-before`; `r3/runs/<id>-*.log`)

| Id | Mutation | Catcher | First failure |
|---|---|---|---|
| VM01 | HELD -> FAILED in RESUME_STATUS | U | `not ok 1 - C6-1 a retained creation answering HELD -> memo HELD + CREATE_HELD at the CREATING step` |
| VM11 | REMOVE recovers through `recoverConsensusCreation` | U | `not ok 4 - C6-8/cell (b) closed:false -> REMOVE_HELD ...`; `not ok 5 - cell (c)` |
| VA7 | HELD re-entry without the in-flight guard | U | `not ok 1 - F9 a duplicate CREATE while a HELD re-entry is in flight starts no second resume` |
| VA8 | ALREADY_PRESENT early return removed | L; N | L `not ok 1 - after PRESENT a second mark for its own token answers ALREADY_PRESENT and leaves pendingRoleUpdate untouched`; N green (cannot see the latch, as in round 1) |
| RA | re-entry resumes the request id (`params.operationId`) | U | `not ok 1 - RV5.1 a CREATE under another operation id ... keeps the memo creation ...`; `not ok 2 - RV5.1 a wake during that re-entry ...` |
| RB | `writesMemo` -> true (nameless settle overwrites) | U | `not ok 3 - RV5.2 a BOUND_ROUTE_REQUIRED refusal ... leaves a HELD memo untouched`; `not ok 4 - RV5.2 the catch path ...` |
| RB2 | catch path `names: true` | U | `not ok 4 - RV5.2 the catch path before the resume answers a retained class leaves a creation-naming memo untouched` |
| RC | CLOSED wake sets `wakePending` (reason filter removed) | U | `not ok 6 - RV5.3 a RESOURCE_CLOSED wake during the first START is recorded and re-enters nothing` |
| RD | token-less wake matches a nameless memo (`typeof` row removed) | U | `not ok 5 - RV5.3 a wake without a token operation id is NO_LOCAL_OPERATION ...` |

Nine of nine killed by the named behavioural assertion; `git status --short` empty after the chain.

## 4. Statics (clean tree; `r3/statics/`)

| Check | Result | Versus base / round 2 |
|---|---|---|
| `node scripts/check-fast-static.js --base b3793c7e5` | ok in 13.0 s | - |
| decision boundaries `--json`, touched src (route, handler) | total 0, raw 0, inherited 0, baseline 806 | no baseline change |
| eslint, 6 touched JS | 0 problems | - |
| complexity scoped, 6 targets | 1 = `handleRemoveReplica` 14 (inherited, base) | 0 new; the route module 0 |
| cognitive scoped | 0 | - |
| literals scoped (2 src) | 0 new | - |
| silent-catch scoped (2 src) | 0 | - |
| runtime grammar | 0 violations; pressure pass | - |
| `audit:shards` | OK 2409 (digests fnv1a32-8f7e78d2 / fnv1a32-4af5901f; subsystem observation digest updated by the producer for the lifecycle test's new import) | producer outputs only |
| `audit:impact-contracts` | PASS, 67 contracts, 38 coupled pairs | +1 / +1 |
| `audit:file-size` | 26/27, 21/21 | unchanged |
| `test:unused:ratchet` | 1456 | = base 1456 |
| `test:duplication` | src+scripts 47/47, 1462/1462; test 698/26458 | = base 698/26458 |
| import-graph seal | refresh reproduced the committed digests (snapshot `0bae9c2c...`); tree clean | producer output |

## 5. Runs (gated, serial; `r3/runs/`)

U ok 33 assertions; N ok 3 (1.4 s); L `wasm-service-lifecycle` ok 62; handler ok 38; P ok 16; publication integration ok 25 (P11 green); verifier probe ok (deleted afterwards).

## 6. Lab - PENDING

Round-2 broad run #161-#163 at 04f1a9112 (85 files, three hosts) and the round-3 changed-cone run #167 (request
`9ea4b1bffc92426389ab5c9124248dcb`, 18 files, lenovo-laptop, at 9f83c7be3) are WAITING_APPROVAL behind the owner's
#159; no record under `~/.local/state/lagrange-lab/runs/` at hand-back. Classification recipe as in round 1 (match
`placement-head`; six expected-red files; everything else compared with the base).

## 7. What I did not read or run (counted)

Not read: the activation charter and closeout-plan edits (lead's documents, excluded by the brief); the round-1
evidence copy under `evidence/activation-discovery-20261017/verifier-1c-round1/` (my own bytes); the implementer's
red-first logs beyond the report's table; `scripts/check-fast-static.js` internals. Not run: the base tree; any lab
host; N under the route mutations RA-RD (U is their designed catcher; VA8 was run against N to confirm it still
cannot see the latch); the 18-file lab selection locally beyond the six files above.

## 8. Verdict

**PROVISIONAL (lab PENDING). On the round-3 delta: REJECT, narrow - RV5.1, RV5.3, RV5.4, RV5.5 and RV5.6 hold as
measured and V-F1 is closed for the HELD memo; RV5.2 is incomplete (V-F2): the same creation-link loss remains for a
FAILED (named deferral) or REMOVING (closed:false) memo, through the handler's unconditional CREATING write, and the
next REMOVE then takes the generic path (P5: REMOVE_FAILED forever on a half-retired replica; P6: REMOVE_COMPLETED
with the slot ADMITTED).**

Required: one node-side change (V-F2, shape chosen by the lead: leave a creation-naming memo untouched in
`handleCreateReplica` and let RV5.2's guard decide, or re-enter the named deferral like HELD and refuse a CREATE for a
REMOVING memo) plus two U witnesses; re-measure U and N, the route/handler statics, duplication and unused ratchets.
Recorded, non-blocking: V-N11 (nameless-HELD fallback should fail closed; unreachable in production), V-N12 (RV5.5
text lists `events`, which the shared helper reads), V-N13 (stand-in creation in the latch witness, acceptable),
V-N14 (new contract + pair, right shape), V-N15 (GRANT_HELD in flight yields one re-entry, by design).

This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on anyone's
behalf.
