# Implementer report: stage 1c round 4 (corrective, design Revision 6), Quest wasm-creation-genesis

This round fixes V-F2 and closes V-N11 and V-N12, following Revision 6 (RV6.1-RV6.5).
- Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, base
  b3793c7e5, uncommitted. The current tree before this round was 9f83c7be3, my round-3 state; the
  route's sha matched round 3.
- Nothing was committed, staged, pushed, reset, cleaned or stashed. No baseline was raised.
- The design note and the quest log were not edited.
- The round-3 bytes of every file I touched are in `scratchpad/r4-pristine/` with `SHA256SUMS`.
  The diffs are in `scratchpad/static-1c-r4/round4-{route,handler,constants}.diff`.
- This is not a claim that the stage is done. The verifier re-measures.

## Changes (file:line at the current tree)

### A. RV6.1: one writer of the creation link
- `src/node/runtime-service-handler.js`: `handleCreateReplica` reads `existing` once (:273) and
  calls the new `trackCreateRequest(existing, params)` (:295, defined at :329).
- That method writes the CREATING memo only when `!namesCreation(existing)` (:330). It always
  records the request in `inProgressOperations`.
- The write and the in-flight entry for a nameless memo are the same statements as before, moved
  into the method. The extraction also keeps `handleCreateReplica` under the complexity threshold.
- The predicate is `namesCreation(memo)` = `typeof memo?.operationId === 'string'`
  (route module :92). `writesMemo` (:99) now uses the same predicate, so there is one definition of
  "names a creation".

### B. RV6.2: a named deferral re-enters like HELD
- `reenterHeldCreation` is renamed `reenterRetainedCreation` (route :212). It is no longer
  exported; the handler reaches it through `replyToRetainedMemo`.
- `replyToRetainedMemo(handler, existing, params)` (route :253):
  - HELD goes to `reenterRetainedCreation`.
  - A named memo goes to `NAMED_MEMO_REPLIES` (:240): FAILED -> `reenterRetainedCreation`,
    REMOVING -> `deferDuringRetirement`.
  - Everything else, including every nameless FAILED or REMOVING memo, answers null and takes the
    generic path, unchanged.
- The re-entry resumes `existing.operationId` under its own id whatever the request's id, replies
  IN_PROGRESS (`inProgressReply`, :195) and logs `requestOperationId`.
- Handler: `replyToExistingReplica` keeps ACTIVE first and CREATING last. Between them it now calls
  `replyToRetainedMemo` (:375); the old HELD-only branch is removed. The JSDoc is updated.

### C. RV6.3: a CREATE for a named REMOVING memo
- `deferDuringRetirement` (route :233) writes no tracker entry and routes nothing.
- It settles the request synchronously under its own id with the existing carrier: CREATE_FAILED +
  `deferRetry`, code `RETIREMENT_IN_PROGRESS`, `names: false`. The memo is therefore untouched under
  RV5.2.
- It replies IN_PROGRESS.
- Synchronous emission has precedent: the ACTIVE branch emits CREATE_ACTIVE before replying.
- New code at the owner: `src/node/runtime-service-handler-constants.js:85`,
  `RETIREMENT_IN_PROGRESS: 'runtime_service_retirement_in_progress'`.

### D. RV6.4: a nameless HELD memo fails closed
- `reenterRetainedCreation` (:213) refuses a memo for which `namesCreation` is false.
- It logs `LOG.CREATE_FAILED` with `requestOperationId` and the code. It answers the handler's
  existing ERROR reply shape, `{status: ERROR, error, errorCode, deferRetry: false, nodeId}`, the
  same shape as `CREATE_INVALID_REPLICA_ID`.
- The memo is untouched and nothing is emitted. The `?? params.operationId` fallback is removed.
- Code used: **new** `CORRUPT_LOCAL_MEMO: 'runtime_service_corrupt_local_memo'` (constants :87).
  No existing code of `RUNTIME_SERVICE_HANDLER_ERROR_MSG` names a corrupt local state. The existing
  codes cover required fields, invalid replica id, missing owners, definition not found and
  BOUND_ROUTE_REQUIRED.

### E. RV6.5
- No fixture change: `events` stays.
- Corrected wording of round-3 E: the embedding fixture dropped `held`, `phase` and `holdResponses`.
  `events` is kept because the shared `deliverScheduled` / `record()` writes it.
- RV5.5's list, which included `events`, was wrong on that field. F-r3-1 is closed by RV6.5.

### Witnesses
New U tests in `test/node/runtime-service-bound-route.test.js`, inside the round-3 describe:

| Line | Witness |
|---|---|
| :518 | RV6.3 (P5) REMOVING memo |
| :547 | RV6.1 tracker never writes a named memo (see F-r4-1) |
| :567 | RV6.2 (P6) named deferral under another id |
| :586 | RV6.2 same-id retry re-enters once |
| :599 | RV6.4 (P8) nameless HELD |
| :617 | the two codes at the owner |

Handler test, `test/node/runtime-service-handler.test.js:319`: a CREATE over a nameless FAILED or
REMOVING memo takes the generic path (INITIATED, memo CREATING, then ACTIVE). This is the
"nameless keeps today's behaviour" witness, so it is green on both trees.

Round-4 line deltas against round 3: route 84, handler 52, constants 4, U 118, handler test 21.

## Red first (`scratchpad/red-1c-r4/`)

- `red-runtime-service-bound-route.test.js.log`: the five round-4 U tests with only the tests added,
  on the round-3 sources. All five were red.
- `red2-...log`: the RV6.1 test, added after the implementation. It was run on the round-3 sources
  by swapping in the pristine src bytes, then restoring them; the restored sha256 equals the saved
  copies (`*.r4`).

| Witness | Failure on the round-3 sources |
|---|---|
| P5 | `A_CREATE_WAS_ACCEPTED_OVER_A_RETIREMENT`: actual `initiated`, expected `in_progress` |
| RV6.1 | `TRACKER_OVERWROTE_A_NAMED_MEMO` |
| P6 | reply `initiated`, expected `in_progress` |
| same-id retry | replies `[initiated, in_progress]` |
| P8 | reply `in_progress`, expected the ERROR shape with CORRUPT_LOCAL_MEMO |
| codes | expected `'runtime_service_retirement_in_progress'`, actual undefined |

- The handler-test witness was green on the round-3 tree (39 assertions), as a regression guard
  should be.
- After the fix: `green2-...log` shows U green with 39 assertions; the handler test is green with
  39.

## Mutations (`scratchpad/mutations-1c-r4/`)

- `run.py` is the driver and `results.ndjson` holds the records. Each mutation was an exact
  replacement, run against its catcher behind the thermal gate, then restored from a byte copy.
- sha256 restored equals before for all 7: route `12623581...`, handler `789056db...`.
- `git status --short` is the same before and after.

| Id | Mechanism | Catcher | First failure |
|---|---|---|---|
| M4-A | tracker overwrites a named memo (the `namesCreation` guard in `trackCreateRequest` removed) | U | `not ok 8 - RV6.1 the in-progress tracker never writes a creation-naming memo ...`: `TRACKER_OVERWROTE_A_NAMED_MEMO` |
| M4-B | named deferral refused instead of re-entered (FAILED removed from `NAMED_MEMO_REPLIES`, so the request goes through the route and is refused) | U | `not ok 9 - RV6.2 (P6) ...`: actual `initiated`, expected `in_progress` (test :572); also `not ok 10 - RV6.2 the same-id retry` |
| M4-C | REMOVING memo written by a CREATE (`deferDuringRetirement` settles with `names: true`) | U | `not ok 7 - RV6.3 (P5) ...`: `TRACKER_OVERWROTE_THE_REMOVING_MEMO` |
| M4-C2 (extra) | REMOVING removed from `NAMED_MEMO_REPLIES` (the CREATE is routed) | U | `not ok 7 - RV6.3 (P5) ...`: `A_CREATE_WAS_ACCEPTED_OVER_A_RETIREMENT` |
| M4-D | nameless HELD resumes the request (refusal guard disabled, `?? params.operationId` fallback restored) | U | `not ok 11 - RV6.4 (P8) ...`: deepEqual of the ERROR reply (test :607) |
| RA | re-entry resumes `params.operationId` | U | `not ok 1 - RV5.1 a CREATE under another operation id ...`: `REENTRY_RESUMED_THE_REQUEST_ID` (3 not ok) |
| RB | `writesMemo` returns true | U | `not ok 3 - RV5.2 a BOUND_ROUTE_REQUIRED refusal ...`: `NAMELESS_SETTLE_OVERWROTE_MEMO` (4 not ok) |

All 7 were killed by the named witness, each on a behavioural assertion.

## Statics (`scratchpad/static-1c-r4/`, clean tree)

| Check | Result | Versus base / round 3 |
|---|---|---|
| `node scripts/check-fast-static.js --base b3793c7e5` | ok in 11.3 s (an earlier run failed on 2 max-len lines in U; fixed) | - |
| decision boundaries `--json`, 24 touched src | 0 new, raw 6, inherited 6, baseline 806 | = round 3 |
| decision boundaries `--json`, the 3 round-4 src | 0 / 0 / 0 | - |
| eslint, 38 touched JS | 0 problems | - |
| complexity scoped, 38 targets | 5, all inherited (`resolveEndpointAddress` 14, `handleRemoveReplica` 14, `validateEndpointIntent` 15, `_buildLifecycleLogContext` 16, completeness arrow 14) | 0 new; `handleCreateReplica` not listed |
| cognitive scoped | 0 | - |
| literals scoped, 24 src | 0 new | - |
| silent-catch scoped | 1 = the inherited `writeAndObserve` | = base |
| `audit:shards` | OK 2409 (fnv1a32-8f7e78d2 / fnv1a32-4af5901f) | no drift, so no `test:metadata:refresh` this round |
| `audit:impact-contracts` | PASS 67/38 | = round 3 |
| `test:duplication` | src+scripts 47/47, 1462/1462; test 698/26458 | = base 698/26458 |
| `test:unused:ratchet` | 1456 | = base 1456; `reenterHeldCreation`'s export is replaced by the two used exports `replyToRetainedMemo` and `namesCreation` |
| `audit:file-size` | source 26/27, test 21/21 | unchanged |

On duplication: no new groups. The one jscpd group that touches the handler test (its lines 31-56
against `message-group-service-handler.test.js`, which is unchanged) covers the header area; the
lines I added start at :319.

## Local runs (`scratchpad/runs-1c-r4/`)

Gated, serial, through `npm run test:file`.

| File | Result |
|---|---|
| test/node/runtime-service-bound-route.test.js (U) | ok, 39 |
| test/wasm-service/bound-creation-handler-embedding.integration.test.js (N) | ok, 3 |
| test/node/runtime-service-handler.test.js | ok, 39 |
| test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 |

## Lab selection: `scratchpad/reports/lab-selection-r4.txt`, 18 files

- Same method as round 3: test-chain importers from the generated import graph plus one production
  hop, because `select-proof-cone.js` escalates to the full suite on stale coverage.
- The round-4 additions are `runtime-service-handler-constants.js` and the handler test.
  - The constants' test-chain importers are already in the round-3 list.
  - The handler test was already in it.
- The rounds 3+4 cone is therefore the same 18 files. All exist and are primary-classified.
- The constants' one other src importer, `src/control-plane/replica-dispatch-service-dispatch-observation-methods.js`,
  is unaffected: the change only adds two keys to a frozen map.

## F-items

- **F-r4-1 (RV6.1 witness):** with B and C in place, the tracker never sees a named FAILED or
  REMOVING memo; they are answered before it. A revert of A alone is therefore invisible to P5 and
  P6.
  - The RV6.1 witness uses the remaining reachable named state: the REMOVED memo after a completed
    bound REMOVE keeps its `operationId` through `settleRemoval`'s spread.
  - In that witness a CREATE under another id is tracked in flight only, and its
    BOUND_ROUTE_REQUIRED refusal leaves the memo as it is. M4-A is killed there.
- **F-r4-2 (third memo writer, recorded, not changed):** `createGenericReplicaAsync` writes
  ACTIVE/FAILED memos without `operationId`.
  - It is reachable only for a definition that is not bound-class. Reaching it with a named memo
    needs a bound creation's replica id under a non-bound definition. I did not trace whether that
    can be produced.
  - Out of RV6's scope; I left it alone.
- **F-r4-3:** RV6.3's deferral is emitted synchronously inside `handleCreateReplica`, before the
  IN_PROGRESS reply returns, like the existing ACTIVE re-announce. If the lead wants it after the
  ACK, it moves into a `setImmediate`.
- **F-r4-4:** RV6.4's code is new, `CORRUPT_LOCAL_MEMO`; no existing code fit. The refusal logs
  through the existing `LOG.CREATE_FAILED` message rather than a new log constant.
- Carried from round 3: F-r3-3 (the brief's path `scripts/checks/check-fast-static.js` does not
  exist; I ran `scripts/check-fast-static.js`). F-r3-4 and F-r3-5 are as the verifier recorded
  them (V-N14, V-N13).

## Not run

- The lab, which belongs to the lead.
- The other 14 lab-selection files locally.
- The base tree. Base numbers are from the round-2 base logs.
- The lifecycle unit test: untouched this round.
- N under the round-4 mutations; U is their designed catcher.
