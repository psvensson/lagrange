# Implementer report: stage 1c round 5 (corrective, design Revision 7), Quest wasm-creation-genesis

This round fixes V-F3: a permanently failed named memo captured later CREATEs for its canonical
replica, including J's founder.
- Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, base
  b3793c7e5, uncommitted. The tree before this round was 6b4208268, my round-4 state; the route and
  handler sha256s matched it.
- Nothing was committed, staged, pushed, reset, cleaned or stashed. No baseline was raised.
- The design note and the quest log were not edited.
- The round-4 bytes of every file I touched are in `scratchpad/r5-pristine/` with `SHA256SUMS`.
  The diffs are in `scratchpad/static-1c-r5/round5-{route,handler}.diff`.
- This is not a claim that the stage is done. The verifier certifies the custody table.

## Changes (file:line at the current tree)

### A. RV7.1: the deferral flag (`src/node/runtime-service-bound-creation-route.js`)
- `settleCreation` builds `deferral = {deferRetry: true}` when the decision is DEFERRED (:109) and
  spreads it into the memo write (:112). The outcome already carries the same flag through
  `failureOptions`.
- A permanent FAILED settle records no flag. Its memo stays in place, still named, so a bound REMOVE
  can use it.

### B. RV7.2: only a live retained creation re-enters
- `NAMED_MEMO_REPLIES` (:251) maps FAILED to the new `reenterDeferredCreation` (:246). It re-enters
  only when `existing.deferRetry === true`; otherwise it answers null.
- On null, the CREATE goes through the handler's `trackCreateRequest` (in flight only, RV6.1) and
  is then routed under its own id:
  - a retained request (J) takes the memo by a named settle;
  - an unrouted request is refused nameless, and the memo is untouched (RV5.2).
- HELD and REMOVING handling is unchanged. The JSDoc of `replyToRetainedMemo` is updated.

### C. RV7.3: a named ACTIVE memo and a foreign request
- New `refuseForeignCreation(handler, existing, {operationId, replicaId})` (route :265, exported
  for the handler).
- For a named memo whose `operationId` differs from the request's, it:
  - emits CREATE_FAILED under the request's id with the existing code
    `SERVICE_INSTANCE_OUTCOME.CONTENT_CONFLICT`, through `failureOptions`, at WORKFLOW_STEP.FAILED;
  - logs `LOG.CREATE_FAILED` with `creationOperationId`;
  - answers true.
- A same-id duplicate or a nameless memo answers false. The memo is never written.
- Handler (`src/node/runtime-service-handler.js:363`): the ACTIVE branch wraps its unchanged
  CREATE_ACTIVE emission in `if (!refuseForeignCreation(...))`. The reply is still ALREADY_EXISTS in
  every case. The import is at :33 and the JSDoc is updated.

### D. Nothing else changed
Every other row of the custody table already held; no row made me stop.

Round-5 line deltas against round 4: route 47, handler 22, U 117.

## Custody table, cell by cell (U = `test/node/runtime-service-bound-route.test.js`)

| Memo | Same id | Different id |
|---|---|---|
| absent / nameless CREATING / FAILED / REMOVING | generic path: H :319 (FAILED, REMOVING); the pre-existing H CREATING and INITIATED tests | same |
| HELD, named | U C6-3 / F9 | U RV5.1 (x2) |
| FAILED, named, `deferRetry` | U RV6.2 same-id retry; U RV7.1 (first half) | U RV6.2 (P6) |
| FAILED, named, permanent | U RV7.1 (second half): INITIATED, routed under the request id | U RV7.2 (P14) |
| ACTIVE, named | U RV7.3 same-id (CREATE_ACTIVE) | U RV7.3 (CONTENT_CONFLICT) |
| REMOVING, named | U RV6.3 (P5) uses another id; same-id is the same code path (no id test) | U RV6.3 (P5) |
| REMOVED, named | U RV7.2 (P15): the late duplicate of I answers RESOURCE_CLOSED and writes a permanent FAILED memo | U RV6.1; U P15, J's founder |
| HELD without a creation id | the same code path, which never reads the id | U RV6.4 (P8) |

## Red first (`scratchpad/red-1c-r5/red-runtime-service-bound-route.test.js.log`, on the round-4 sources)

| Witness | Failure on round-4 sources |
|---|---|
| P14 | `A_DEAD_CREATION_CAPTURED_THE_REQUEST`: actual `in_progress`, expected `initiated` |
| P15 | the full facts-c sequence reproduced up to J's CREATE: owner RELEASING then CLOSED; the late duplicate answered INITIATED with a permanent FAILED memo carrying RESOURCE_CLOSED; J SELECTED and prepared ADMISSION_RETAINED under `successor-operation-0` for the same canonical replica. J's reply was `in_progress`, expected `initiated` (test :675) |
| RV7.1 | `DEFERRAL_FLAG_NOT_RECORDED` |
| RV7.3 different id | `A_FOREIGN_REQUEST_EARNED_CREATE_ACTIVE` |
| RV7.3 same id | green on round 4, as a regression guard should be |

After the fix (`green-*.log`): U is green with 44 assertions, and the handler test with 39. Every
round-3 and round-4 witness stays green.

## Mutations (`scratchpad/mutations-1c-r5/`)

- `run.py` is the driver and `results.ndjson` holds the records. Each mutation is an exact
  replacement, run against U behind the thermal gate, then restored from a byte copy.
- sha256 restored equals before (`b6adbaca...`) for all 6.
- `git status --short` is the same before and after.

| Id | Mechanism | Catcher | First failure (other reds) |
|---|---|---|---|
| R5-B | permanent failure re-enters (the `deferRetry` check in `reenterDeferredCreation` removed) | U | `not ok 12 - RV7.2 (P14) ...`: `A_DEAD_CREATION_CAPTURED_THE_REQUEST` (also P15 and RV7.1) |
| R5-A | deferral flag not recorded (`...deferral` dropped from the memo) | U | `not ok 9 - RV6.2 (P6) ...`: actual `initiated`, expected `in_progress` (also the RV6.2 retry, and RV7.1 `DEFERRAL_FLAG_NOT_RECORDED`) |
| R5-C | ACTIVE branch emits CREATE_ACTIVE for a different id (`refuseForeignCreation` always answers false) | U | `not ok 15 - RV7.3 a named ACTIVE memo and a request under a different id ...`: `A_FOREIGN_REQUEST_EARNED_CREATE_ACTIVE` |
| M4-B | FAILED removed from `NAMED_MEMO_REPLIES` (re-applied by mechanism; the map value is now `reenterDeferredCreation`) | U | `not ok 9 - RV6.2 (P6) ...`: `initiated` vs `in_progress` (also the RV6.2 retry and RV7.1) |
| RA | re-entry resumes the request id | U | `not ok 1 - RV5.1 a CREATE under another operation id ...`: `REENTRY_RESUMED_THE_REQUEST_ID` |
| RB | `writesMemo` returns true | U | `not ok 3 - RV5.2 a BOUND_ROUTE_REQUIRED refusal ...`: `NAMELESS_SETTLE_OVERWROTE_MEMO` |

All 6 were killed by the named witness, each on a behavioural assertion.

## Statics (`scratchpad/static-1c-r5/`, clean tree)

| Check | Result | Versus base / round 4 |
|---|---|---|
| `node scripts/check-fast-static.js --base b3793c7e5` | ok in 11.4 s, before and after the metadata refresh | - |
| decision boundaries `--json`, 24 touched src | 0 new, raw 6, inherited 6, baseline 806 | = round 4 |
| decision boundaries `--json`, the 2 round-5 src | 0 / 0 / 0 | - |
| eslint, 38 touched JS | 0 problems | - |
| complexity scoped, 38 targets | 5, all inherited | 0 new |
| cognitive scoped | 0 | - |
| literals scoped | 0 new | - |
| silent-catch scoped | 1 = the inherited `writeAndObserve` | = base |
| `audit:shards` | OK 2409 | unchanged |
| `audit:impact-contracts` | PASS 67/38 | unchanged |
| `test:duplication` | src+scripts 47/47, 1462/1462; test 698/26458 | = base; no clone group touches U |
| `test:unused:ratchet` | 1456 | = base. The one new export, `refuseForeignCreation`, has a consumer (the handler) |
| `audit:file-size` | 26/27, 21/21 | unchanged |

V-N19 metadata refresh: `npm run test:metadata:refresh` ran at the end of the round
(`metadata-refresh.txt`, with `shards-before.sha` and `shards-after.sha`).
- Only `test/shards/impact-graph-seal.json` changed.
  - `sourceDigest`: now `7c7b1dc6...`.
  - `producerInputDigest`: now `61cebacc...`.
  - `snapshotDigest`: `0bae9c2c...` -> `86f21e7f...`.
- The seal's own byte digest is now `342069ca...`; `resolverStateDigest` is unchanged.
- primary, resource and subsystem classes regenerated byte-identical.
- fast-static and `audit:shards` are ok after the refresh.

## Local runs (`scratchpad/runs-1c-r5/`)

Gated, serial, through `npm run test:file`.

| File | Result |
|---|---|
| U | ok, 44 |
| N | ok, 3 |
| test/node/runtime-service-handler.test.js | ok, 39 |
| test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 |

## Lab selection: `scratchpad/reports/lab-selection-r5.txt`, 18 files

- Recomputed with the same method over the rounds 3-5 touched set (route, handler, constants,
  embedding fixture), plus one production hop through `runtime-service-handler-setup.js` and the
  edited tests.
- It is identical to `lab-selection-r4.txt`. All files exist and are primary-classified.

## F-items

- **F-r5-1:** A DEFERRED settle records the flag whether or not the memo is named.
  - So the bound-class UNAVAILABLE deferral, and the catch path before a retained answer, now
    write a nameless FAILED memo with `deferRetry: true`, when the current memo is nameless.
  - It cannot re-enter, because `replyToRetainedMemo` requires a named memo; a later CREATE takes
    the generic path as before.
  - I read RV7.1 ("a DEFERRED settle records `deferRetry: true`") as unconditional. Restricting the
    flag to named settles would be a one-token change if you prefer it.
- **F-r5-2:** RV7.3's CREATE_FAILED is emitted synchronously before the ALREADY_EXISTS reply, the
  same order as the existing CREATE_ACTIVE re-announce (V-N16 precedent).
- **F-r5-3 (custody table):** two cells have no test of their own.
  - "REMOVING named, same id" shares the different-id code path; no id comparison happens.
  - "nameless HELD, same id" is the same: the corrupt check never reads the request id.
  - Neither has a same-id witness. I did not add them because the brief lists none; say if you want
    them.
- Carried: F-r3-3 (the brief's path `scripts/checks/check-fast-static.js` does not exist; I ran
  `scripts/check-fast-static.js`).

## Not run

- The lab, which belongs to the lead.
- The other 14 lab-selection files locally.
- The base tree. Base numbers are from the round-2 base logs.
- The lifecycle unit test: untouched since round 3.
- N under the round-5 mutations; U is their designed catcher.
