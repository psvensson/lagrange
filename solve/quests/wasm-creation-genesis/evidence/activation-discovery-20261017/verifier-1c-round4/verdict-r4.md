# Verifier verdict, stage 1c round 4 (corrective; design Revision 6): narrow re-measurement of V-F2

Independent adversarial verifier (Fable). Subject: `git diff 9f83c7be3 6b4208268` minus the lead's documents (design
Revision 6, closeout plan, quest log, retained round-3 evidence): `src/node/runtime-service-bound-creation-route.js`,
`src/node/runtime-service-handler.js`, `src/node/runtime-service-handler-constants.js`,
`test/node/runtime-service-bound-route.test.js`, `test/node/runtime-service-handler.test.js`. Read in
`/mnt/data/peter/projects/.worktrees/verify-1c` detached at `6b420826829d49d39191efe46da0f4b5f005c27b`
(`refs/heads/wip/rs-raft-serving-publication-5`; parent `9f83c7be3` = my round-3 tree), then
`node scripts/generate-global-owner-debt-inventory.js --refresh-import-graph-only`. Binding: Revisions 1-6 (latest
wins), the three stage-1c vet reports, my round-1 and round-3 verdicts. Hard rules kept as in rounds 1 and 3 (no
commit/stage/push/reset/clean/stash; refs untouched; `git checkout --detach` only; mutations restored byte-identically;
every run through `npm run test:file -- <file>` behind the thermal gate and the no-other-runner guard; no lab host).

## 0. Frozen delta claim (RV6.1-RV6.5 as implemented)

RV6.1 the handler's `trackCreateRequest(existing, params)` writes the CREATING memo only when `!namesCreation(existing)`
(`namesCreation` = `typeof memo?.operationId === 'string'`, one predicate shared with the route's `writesMemo`); it
always records the request in `inProgressOperations`; the route's `settleCreation` is the sole writer of a
creation-naming memo. RV6.2 `replyToRetainedMemo`: HELD -> `reenterRetainedCreation`; named FAILED ->
`reenterRetainedCreation` (resumes the memo's creation under its own id whatever the request's id, IN_PROGRESS,
`requestOperationId` logged); RV6.3 named REMOVING -> `deferDuringRetirement` (no tracking, no route; the request is
settled synchronously under its own id as CREATE_FAILED + `deferRetry` + `RETIREMENT_IN_PROGRESS`, `names: false`,
memo untouched; reply IN_PROGRESS); everything else, including every nameless FAILED/REMOVING memo, answers null
(generic path unchanged). RV6.4 a HELD memo that names no creation -> ERROR reply `{status: ERROR, error, errorCode:
CORRUPT_LOCAL_MEMO, deferRetry: false, nodeId}`, memo untouched, nothing emitted, no fallback to the request's id.
RV6.5 `events` stays in the embedding fixture. Codes owned by `runtime-service-handler-constants.js`
(`RETIREMENT_IN_PROGRESS` :85, `CORRUPT_LOCAL_MEMO` :87).

## 1. Census of every writer of `localReplicas` at 6b4208268 (brief item 1)

| Writer | Writes | Can it overwrite a creation-naming memo? From which state? |
|---|---|---|
| `handler.trackCreateRequest` (:331) | `{replicaId, entityId, status: CREATING}` | No: guarded by `!namesCreation(existing)`; a named memo is tracked in flight only (U RV6.1; PROBE P10) |
| route `settleCreation` (:106) via `writesMemo` | named HELD/ACTIVE/FAILED when `decision.names`; nameless FAILED only when the current memo is nameless | A named settle overwrites by design (the request IS a retained creation: the new creation takes the id); a nameless settle never (U RV5.2; PROBE P10) |
| `createGenericReplicaAsync` (:458 ACTIVE, :478 FAILED) | nameless | Yes, but only from a REMOVED named memo (the sole named status `replyToExistingReplica` lets through) whose definition row is no longer bound-class or whose request is UNROUTED and non-bound: PROBE P11 (REMOVED named + native_js row -> nameless ACTIVE memo, generic replica). A REMOVED memo's creation is CLOSED: nothing of it is live, no custody is lost. F-r4-2 judged: reachable, harmless. |
| `recoverLocalReplicaForRemoval` (:565) | `{..., status: row.status, ...rowCreationHint}` | No: runs only when no memo exists |
| `handleRemoveReplica` (:670) | `{...replica, status: REMOVING}` | No: spread keeps `operationId` |
| `removeGenericReplicaAsync` (:726 REMOVED, :743 FAILED) | nameless | No: chosen only when the memo has no `operationId` |
| route `settleRemoval` (:348, :358) | `{...memo, status}` | No: spread keeps `operationId` |
| `registerExistingReplica` (:931) | caller's object | External; no `src/` caller (round-3 census); the only source of a nameless HELD memo (RV6.4) |
| `shutdown` (:944) | clear | restart semantics (recovery stage) |

One predicate, `namesCreation` (route :92), is read by both the tracker and `writesMemo`. The round-3 writer that dropped the link is gone.

## 2. Coverage of the touched cells (U = runtime-service-bound-route.test.js (39), H = runtime-service-handler.test.js (39), N = C6 embedding, PROBE = r4/probes/facts*.ndjson)

| # | Cell | Round 4 |
|---|---|---|
| 13 | same-id duplicate CREATE while HELD -> re-enter once, IN_PROGRESS, outcome under the creation | U C6-3/F9; PROBE P9r |
| 14 | CREATE under another id while HELD -> memo kept, re-entered under its id | U RV5.1 x2 (green) |
| 14c | CREATE under another id while REMOVING (named) -> memo untouched, no tracking, no route, CREATE_FAILED + deferRetry + RETIREMENT_IN_PROGRESS under the request, reply IN_PROGRESS; re-REMOVE bound and completes | U RV6.3; PROBE P5r (`inFlightTracked: false`, stops `[true, true]`, REMOVE_COMPLETED) |
| 14d | CREATE under another id while FAILED (named deferral) -> re-enters the creation under its id (HELD), reply IN_PROGRESS; next REMOVE bound | U RV6.2; PROBE P6r |
| 14d' | same-id retry of a named deferral -> one re-entry; after the grant it answers PUBLISHED -> ACTIVE under the creation | U RV6.2 retry; PROBE P6s |
| 14e | nameless HELD memo -> ERROR `{error, errorCode: CORRUPT_LOCAL_MEMO, deferRetry: false, nodeId}`, memo untouched, nothing emitted, nothing routed | U RV6.4; PROBE P8r |
| 14f | REMOVED named memo + CREATE under another id, bound-class row -> tracked in flight only, memo untouched, BOUND_ROUTE_REQUIRED under the request | U RV6.1; PROBE P10 |
| 14g | REMOVED named memo + definition no longer bound-class -> generic path, nameless ACTIVE memo (F-r4-2) | PROBE P11 (harmless: closed creation) |
| 14h | PERMANENTLY failed named memo (TERMINAL_OPERATION / RESOURCE_CLOSED / CORRUPT_STATE / CONTENT_CONFLICT / INVALID_REQUEST) + CREATE under another id | PROBE P14 (and P15) -> finding V-F3 |
| 16 | nameless FAILED or REMOVING memo -> generic path byte for byte (INITIATED, CREATING, then ACTIVE) | H :319 |
| - | `trackCreateRequest` moved statements identical for nameless memos | READ (same object literals, same `inProgressOperations` entry) |

## 3. Findings by category (round 4)

### V-F3 (REQUIRED; recovery-replay #5 "absence proves nothing" inverted: a dead record treated as live; owner-interaction #9) RV6.2 re-enters EVERY named FAILED memo, but `settleCreation` names the memo for permanent failures too; a dead creation then captures every later CREATE for the canonical replica, including J's founder

- Mechanism: `routeRuntimeServiceCreate` settles every retained-class answer with `names: true` (`route.js:165-167`), so `DECISION.FAILED` answers (TERMINAL_OPERATION, RESOURCE_CLOSED, CORRUPT_STATE, CONTENT_CONFLICT, INVALID_REQUEST: RV3.3 "slot not live or request invalid") write `{status: FAILED, operationId}` exactly like a deferral (`DECISION.DEFERRED`, RV3.2). `NAMED_MEMO_REPLIES` (:240) maps FAILED to `reenterRetainedCreation` without distinguishing the two, and the memo records nothing that could distinguish them.
- Scenario -> wrong output, PROBE P14 (`r4/probes/facts-b.ndjson`): the creation row is COMPLETED; CREATE -> resume answers TERMINAL_OPERATION -> memo `{failed, operationId: operation-0}` (named); a CREATE under `another-operation-id` -> reply IN_PROGRESS, `resumedIds: ["operation-0"]`, outcome `CREATE_FAILED TERMINAL_OPERATION` under `operation-0`; the request's own id gets no outcome, ever; the memo stays `{failed, operation-0}`, so the next CREATE repeats it. PROBE P15 (`facts-c.ndjson`): I HELD -> bound REMOVE completes (memo `{removed, operation-0}`) -> the owner answers RELEASING then CLOSED for I's token (I's slot CLOSED) -> a late duplicate of I's CREATE: reply INITIATED, resume(I) answers RESOURCE_CLOSED, the named settle writes `{failed, operation-0}` over the REMOVED memo -> J SELECTED (`selectConsensusInstance(request(1, 2, I.incarnation))`), J's founder slot 0 retained under `successor-operation-0` with the SAME canonical replica id (`prepareConsensusCreation` -> ADMISSION_RETAINED) -> J's CREATE for that replica: reply IN_PROGRESS, `resumedIds: ["operation-0"]` (I's dead creation, not J's), outcome `CREATE_FAILED HISTORY_UNAVAILABLE` under `operation-0`; J's `successor-operation-0` receives no outcome; the memo stays `{failed, operation-0}`; J's slot stays ADMITTED (`jSlotPhase: ADMITTED`).
- Why it is reachable in the stage's own sequence (temporal cell 63 "I retired then J created under S"): I's bound REMOVE completes (memo REMOVED, slot CLOSED); a late duplicate of I's CREATE arrives (the coordinator's ordinary dispatch retry after a lost reply): memo REMOVED -> `replyToRetainedMemo` null -> tracked in flight -> resume(I) answers RESOURCE_CLOSED -> named settle writes `{failed, I}` over the REMOVED memo; J's founder CREATE for the same canonical `S-rN` (a retained creation under J, dispatched after all of I's slots are CLOSED, the planner's own rule) is then re-entered as I, fails permanently under I's id, and J's operation never receives an outcome: it times out (B9), is FAILED, and J's ADMITTED slot is orphaned on the node - the V-F1/V-F2 class again, from the design's own happy path.
- Required change (minimal; shape the lead's): distinguish the deferral from the permanent failure in the memo (for example `settleCreation` records `deferRetry: true` on a DEFERRED memo, or a distinct status in the handler's vocabulary), and `replyToRetainedMemo` re-enters a named FAILED memo only when it is a deferral; a permanently failed named memo is left in place (its `operationId` still serves a bound REMOVE, which is idempotent on a CLOSED slot) and the CREATE proceeds under its own id through `trackCreateRequest` (in flight only, RV6.1) and the route: a retained request (J) takes the memo by a named settle, an unrouted one is refused without touching it (RV5.2). Witnesses: U "a permanently failed named memo does not capture a CREATE under another id" (red by P14) and "I retired, late CREATE of I answers RESOURCE_CLOSED, J's founder CREATE for the same canonical replica resumes J" (red by P15).

### V-N16 (recorded; F-r4-3) RV6.3's deferral outcome is emitted synchronously before the IN_PROGRESS reply. Precedent: the ACTIVE branch emits CREATE_ACTIVE before ALREADY_EXISTS. No consumer depends on reply-before-outcome ordering: the coordinator reconciles the response and the executor outcome through separate paths (dispatch response -> step; outcome -> `EXECUTOR_OUTCOME_ACTION_MAP`), the FAIL action has no step guard, and a FAILED operation ignores a later IN_PROGRESS response; in the C6 embedding the REMOVING+CREATE sequence does not occur. The reply IN_PROGRESS beside an outcome FAILED+deferRetry is RV6.3's stated choice (RV3.2: the coordinator FAILs runtime-service deferrals today). Acceptable; recorded.
### V-N17 (recorded; F-r4-4) `CORRUPT_LOCAL_MEMO` and `RETIREMENT_IN_PROGRESS` live at the owner (`runtime-service-handler-constants.js:85, :87`, verified by U "codes at the handler constants owner"); the refusal logs through the existing `LOG.CREATE_FAILED` with an `error` field: adequate (R06: the code is the owned value; the log message is presentation).
### V-N18 (recorded; F-r4-2) `createGenericReplicaAsync` is a third, nameless writer; reachable from a named memo only when it is REMOVED (closed creation) and the definition is no longer bound-class or the request is unrouted-non-bound (PROBE P11): no custody lost. Not changed; correctly left alone.
### V-N19 (recorded; metadata) The committed `test/shards/impact-graph-seal.json` at 6b4208268 is byte-identical to 9f83c7be3's while the round-4 sources changed; the refresh the brief prescribes rewrites its three digests (snapshot `0bae9c2c...` -> `6a1764cc...`), which is the only worktree delta at hand-back. fast-static has no seal stage and `audit:shards` is unaffected; `solve land` refreshes the seal. The implementer's "no metadata drift" holds for the class manifests, not for the seal.
### V-N20 (recorded; verifier process) My first statics pass of this round ran while my untracked probe-B file existed in the worktree; fast-static counted it among "39 changed", so its eslint (unused imports, max-len), `audit:shards` (unclassified file) and the impact-contracts cascade failed on MY file. Re-run on the clean tree: see section 5. Round 1 had the same artefact (then with duplication); noted so nobody reads those logs as the subject's.

Checked and sound: RV6.1 (U RV6.1; P10; the tracker's statements for nameless memos are the round-3 bytes moved into `trackCreateRequest`, same object literal and in-flight entry; H :319 green on both trees as a regression guard); RV6.2 for a true deferral (U RV6.2 x2; P6r, P6s: after a grant the same-id retry answers PUBLISHED -> ACTIVE under the creation); RV6.3 (U; P5r: memo untouched, nothing tracked, deferral under the request, re-REMOVE bound and COMPLETED); RV6.4 (U; P8r: ERROR shape with `deferRetry: false` and `nodeId`, memo untouched, zero outcomes, zero resumes, zero runtime calls); RV6.5 (`events` kept; `record()` writes it); the generic path for nameless FAILED/REMOVING (H); every round-3 witness still green (U 39).

## 4. Mutations (authored from mechanism; applied once; catcher U gated; restored byte-identically; `r4/mutations/`)

| Id | Mutation | First failure (U) |
|---|---|---|
| M4A | tracker overwrites a named memo (`namesCreation` guard removed in `trackCreateRequest`) | `not ok 8 - RV6.1 the in-progress tracker never writes a creation-naming memo ...` |
| M4B | named deferral refused instead of re-entered (FAILED removed from `NAMED_MEMO_REPLIES`) | `not ok 9 - RV6.2 (P6) ...`; `not ok 10 - RV6.2 the same-id retry ...` |
| M4C | REMOVING memo written by a CREATE (`deferDuringRetirement` `names: true`) | `not ok 7 - RV6.3 (P5) ... TRACKER_OVERWROTE_THE_REMOVING_MEMO` |
| M4C2 | REMOVING routed instead of deferred (REMOVING removed from the map) | `not ok 7 - RV6.3 (P5) ... A_CREATE_WAS_ACCEPTED_OVER_A_RETIREMENT` |
| M4D | nameless HELD resumes the request (refusal removed, `?? params.operationId` fallback restored) | `not ok 11 - RV6.4 (P8) ...` |
| RA | re-entry resumes `params.operationId` | `not ok 1 - RV5.1 ...`; `not ok 2 - RV5.1 a wake during that re-entry ...` |
| RB | `writesMemo` -> true | `not ok 3 - RV5.2 ...`; `not ok 4 - RV5.2 the catch path ...` |

Seven of seven killed by the named behavioural assertion; every `*.sha-before` equals the restored sha256.

## 5. Statics (`r4/statics/`)

| Check | Result | Versus base / round 3 |
|---|---|---|
| decision boundaries `--json`, 3 touched src (route, handler, constants) | total 0, raw 0, inherited 0, baseline 806 | no baseline change |
| eslint, 5 touched JS | 0 problems | - |
| complexity scoped, 5 targets | 1 = `handleRemoveReplica` 14 (inherited, base); `handleCreateReplica` under 12 after the extraction | 0 new |
| cognitive scoped | 0 | - |
| literals scoped (3 src) | 0 new | - |
| silent-catch scoped (3 src) | 0 | - |
| runtime grammar | 0; pressure pass | - |
| `audit:file-size` | 26/27, 21/21 | unchanged |
| `test:unused:ratchet` | 1456 | = base 1456 (`reenterHeldCreation`'s export replaced by two used exports) |
| `test:duplication` | src+scripts 47/47, 1462/1462; test 698/26458 | = base 698/26458 |
| `audit:shards` / `audit:impact-contracts` / fast-static `--base b3793c7e5` on the clean tree | `audit:shards` OK 2409 (fnv1a32-8f7e78d2 / fnv1a32-4af5901f); `audit:impact-contracts` PASS 67/38; fast-static ok in 11.2 s (proof range b3793c7e5..HEAD) | first pass invalid (V-N20) |

## 6. Runs (gated, serial; `r4/runs/`)

U ok 39 assertions; N ok 3 (1.4 s); H ok 39; publication integration ok 25; verifier probes A (8), B (3), C (1) ok and deleted afterwards.

## 7. Lab - PENDING

#161-#163 (round 2, 85 files at 04f1a9112) and #169 (round-4 changed cone, request `1f0c4fa649564f9d9fd824aa38d61c2e`, 18 files, lenovo-laptop, at 6b4208268) queued WAITING_APPROVAL behind the owner's #159; #167 withdrawn. No record under `~/.local/state/lagrange-lab/runs/` at hand-back. Classification recipe as in round 1.

## 8. What I did not read or run (counted)

Not read: the activation charter and closeout-plan edits and the quest-log entries of this round (lead's documents); the retained round-3 evidence copy (my bytes); the implementer's red-first logs beyond the report's table. Not run: the base tree; any lab host; N under the round-4 mutations (U is their catcher; N was run green on the clean tree); the lifecycle unit test (untouched this round); the other 14 lab-selection files locally.

## 9. Verdict

**PROVISIONAL (lab PENDING). On the round-4 delta: REJECT, narrow - RV6.1, RV6.3, RV6.4 and RV6.5 hold as measured and
V-F2 is closed for the REMOVING memo and for the deferral; RV6.2 over-reaches (V-F3): by re-entering every named
FAILED memo it also re-enters a permanently failed creation, so a dead creation captures every later CREATE for its
canonical replica (P14), including J's founder after I's retirement and a late retry of I's CREATE (P15) - the same
orphan class, now reachable from the design's own I-then-J sequence.**

Required: one node-side change (V-F3: the memo distinguishes a deferral from a permanent failure, and only a deferral
re-enters; a permanently failed named memo is left for the bound REMOVE and the CREATE proceeds under its own id) plus
two U witnesses (P14, P15 shapes); re-measure U, N, H, the route/handler statics, duplication and unused ratchets.
Recorded, non-blocking: V-N16 (synchronous deferral emission, precedent holds), V-N17 (codes at the owner; log reuse),
V-N18 (third nameless writer, reachable only from a closed creation), V-N19 (stale committed seal; land refreshes),
V-N20 (my first statics pass counted my own probe file).

This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on anyone's
behalf.
