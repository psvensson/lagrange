# Implementer report: stage 1c round 3 (corrective), Quest wasm-creation-genesis

This round covers V-F1 and the recorded notes, following design Revision 5 (RV5.1-RV5.6).
- Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, at
  b3793c7e5 with uncommitted work. The round-2 snapshot was 04f1a9112.
- Nothing was committed, staged, pushed, reset, cleaned or stashed. No baseline was raised.
- The design note and the quest log were not edited.
- Before editing, I copied the round-2 bytes of every file I touch to `scratchpad/r3-pristine/`
  (`SHA256SUMS` is there too). The round-3 src diff is `scratchpad/static-1c-r3/round3-src.diff`.
- This is not a claim that the stage is done. The verifier re-measures.

## Changes (file:line at the current tree)

### A. RV5.1: `src/node/runtime-service-bound-creation-route.js`
- `reenterHeldCreation(handler, existing, params)` (:194) builds
  `creation = {operationId: existing.operationId ?? params.operationId, ...}` (:195).
- It keys the in-flight guard by `creation.operationId` and schedules the re-entry under that id.
  So every re-entry outcome, and the release/wake bookkeeping, names the creation.
- The log field `requestOperationId` carries the request's id (:202). The reply is still
  IN_PROGRESS.
- Call site: `src/node/runtime-service-handler.js:363` passes the memo
  (`reenterHeldCreation(this, existing, {...})`). The JSDoc is updated (:333-336).

### B. RV5.2: the memo-write owner
- `writesMemo` (:87) answers `decision.names || currentMemo?.operationId === undefined`.
- `settleCreation` writes the memo only when that holds. The outcome is still emitted under the
  request's id.
- `routeRuntimeServiceCreate` tracks `retainedAnswer`: it is set at :165 only after the resume
  answered a retained class. The catch path settles with `names: retainedAnswer` (:177).

### C. RV5.3: the wake consumer
- `findWakeTarget` gets a new first row, `typeof operationId !== 'string'` -> ABSENT, which answers
  NO_LOCAL_OPERATION (:236).
- `WAKE_ACTION[IN_FLIGHT]` sets `wakePending` only for `PENDING_WAKE_REASONS` = {GENESIS_OBSERVED,
  GRANT_HELD} (:48, :213). It answers RECORDED in every case.

### D. RV5.4: the PRESENT latch
- New lifecycle unit witness: `test/wasm-service/wasm-service-lifecycle.test.js:782-801`.
  - It uses a real `WasmServiceLifecycle` and a real replica from `createReplica`. A stand-in
    `consensusCreation = {token}` is assigned, because the mark reads only the token, and it is
    reset to null in `finally`.
  - The first mark answers PRESENT. The test then sets `pendingRoleUpdate = null`. The second mark
    must answer ALREADY_PRESENT and leave `pendingRoleUpdate` null (`PRESENT_LATCH_REPLAYED_THE_ROLE`).
- C6 (h): `assert.ok(born >= 0, ... SERVICES_ROW_INSERT_NOT_FOUND)` comes before the ordering check
  (`bound-creation-handler-embedding.integration.test.js:169`).

### E. RV5.5: the embedding fixture
- `bound-creation-handler-embedding-fixture.js:152-154` drops `held`, `phase` and `holdResponses`.
- `events` is kept (F-r3-1).

### F. RV5.6: `test/shards/impact-contracts.json`
- New contract `runtime-service-bound-creation-route` (:1184). Its owners are the route module,
  `service-consensus-bootstrap.js` and `service-runtime-consensus-publication.js`. Its tests are the
  C6 embedding, U and P.
- One coupled pair with the same name (:2402), shaped like the existing pairs. It has two
  non-overlapping endpoints:
  - `handler-bound-creation-route`: the route module.
  - `consensus-bootstrap-and-publication`: bootstrap and publication.
- The pair's witness is the C6 embedding test.
- The registry rejects a pair whose contract is unknown, so the contract entry is a precondition
  of the pair, not a second registration.
- `audit:impact-contracts`: PASS, 67 contracts and 38 coupled pairs (base 66/37).

The round-3 line deltas against round 2 are in `static-1c-r3/round3-delta.txt`:

| File | Changed lines |
|---|---|
| route | 48 |
| handler | 7 |
| U | 136 |
| lifecycle test | 25 |
| embedding test | 1 |
| fixture | 5 |
| impact-contracts | 35 |

## Red first (`scratchpad/red-1c-r3/`)

`U-red.log` is the six new U witnesses on the round-2 source with only the test added. Each one was
red by its own mechanism:

| Witness | Failure on round-2 source |
|---|---|
| RV5.1 other-id CREATE | `REENTRY_RESUMED_THE_REQUEST_ID`: actual `['another-operation-id']`, expected `['operation-0']` (this is P1) |
| RV5.1 wake during re-entry | `WAKE_MISSED_THE_IN_FLIGHT_CREATION`: QUEUED instead of RECORDED |
| RV5.2 BOUND_ROUTE_REQUIRED | `NAMELESS_SETTLE_OVERWROTE_MEMO`: memo became `{status: failed}` with no operationId |
| RV5.2 catch path (emitter fault) | `CATCH_PATH_NAMED_THE_REQUEST`: memo became `{failed, operationId: another-operation-id}` |
| RV5.3 token-less wake | NO_LOCAL_OPERATION expected, RECORDED actual (this is P2) |
| RV5.3 CLOSED wake during the first START | `CLOSED_WAKE_REENTERED`: 2 bound starts, expected 1 (this is P3) |

- After the fix: `U-green.log` is green, 33 assertions.
- The lifecycle witness passes on the round-2 source, because the latch exists. Its red proof is
  VA8, below.
- Also in that directory: `lifecycle-green.log` and `N-green.log`.

## Mutations (`scratchpad/mutations-1c-r3/`)

- `run.py` is the driver and `results.ndjson` holds the records. There is one log per mutation and
  catcher.
- Each mutation was applied by patch or by exact replacement, then the catcher ran behind the
  thermal gate. The file was then restored from a byte copy.
- sha256 after equals sha256 before for all 9 mutations: route `35634ca4...`, serving-state
  `01d01102...`.
- `git status --short` is the same before and after the mutations (`status-before.txt` and
  `status-after.txt`).

| Id | Mechanism | Catcher | First failure |
|---|---|---|---|
| VM01 | retained patch: HELD -> FAILED | U | `not ok 1 - C6-1 ...`: memo `held` vs `failed` |
| VM11 | retained patch: REMOVE via recoverConsensusCreation | U | `not ok 4 - C6-8/cell (b)`: "the re-REMOVE recovered the creation through the journal-only read" |
| VA7 | guard removed (by mechanism; the retained patch's context moved with A) | U | `not ok 1 - F9 ...`: "exactly one re-entry for two duplicate CREATEs" |
| VA8 | retained patch: ALREADY_PRESENT early return removed | lifecycle unit | **KILLED**: `not ok 1 - after PRESENT a second mark ... ALREADY_PRESENT`, actual PRESENT (lifecycle.test.js:796). N still green, as the verifier found. |
| R3-A | re-entry resumes the request id | U | `RV5.1 ... keeps the memo creation`: `REENTRY_RESUMED_THE_REQUEST_ID` (2 not ok) |
| R3-B | nameless settle overwrites the memo (`writesMemo` -> true) | U | `RV5.2 a BOUND_ROUTE_REQUIRED ...`: `NAMELESS_SETTLE_OVERWROTE_MEMO` (2 not ok) |
| R3-B2 (extra) | catch path names the request (`names: true`) | U | `RV5.2 the catch path ...`: `CATCH_PATH_NAMED_THE_REQUEST` |
| R3-C | CLOSED wake sets wakePending | U | `RV5.3 a RESOURCE_CLOSED wake ...`: `CLOSED_WAKE_REENTERED` |
| R3-D | token-less wake matches a nameless memo | U | `RV5.3 a wake without a token ...`: the first wake shape `{"reason":"creation_genesis_observed"}` |

All 9 were killed by the named witness. Every first failure is a behavioural assertion; none is an
import failure or a fixture failure.

## Statics (`scratchpad/static-1c-r3/`)

The tree was clean of mutations when these ran.

| Check | Result | Versus base / round 2 |
|---|---|---|
| `node scripts/check-fast-static.js --base b3793c7e5` | First run FAIL at audit:shards: the subsystem manifest drifted after the test edits. After `npm run test:metadata:refresh`: **ok in 11.3 s** | - |
| decision boundaries `--json`, 24 touched src | total 0 new; raw 6; inherited 6; baseline 806 | = round 2 |
| eslint, 38 touched JS | 0 problems | - |
| complexity scoped, 38 targets | 5, all inherited: `resolveEndpointAddress` 14, `handleRemoveReplica` 14, `validateEndpointIntent` 15, `_buildLifecycleLogContext` 16, completeness arrow 14 | 0 new |
| cognitive scoped | 0 | - |
| literals scoped, 24 src | 0 new | - |
| silent-catch scoped | 1 = the unchanged `writeAndObserve` (inherited) | = base |
| `audit:shards` | OK, 2409 tests | regenerated by their producers |
| `audit:impact-contracts` | PASS, 67/38 | +1 contract, +1 pair |
| `test:duplication` | src+scripts OK 47/47, 1462/1462; test 698/26458 | = base 698/26458, 0 new groups. No clone in the jscpd report touches U, the lifecycle test or the embedding files. |
| `test:unused:ratchet` | 1456 | = base 1456, 0 new |

`test:metadata:refresh` rewrote `primary-classes`, `resource-classes`, `subsystem-classes` and the
three seal digests in `test/shards/impact-graph-seal.json`: `sourceDigest`, `producerInputDigest`
and `snapshotDigest`, now `0bae9c2c...`. These are producer outputs, not hand edits.

## Local runs (`scratchpad/runs-1c-r3/`)

Each run was gated and serial, through `npm run test:file`.

| File | Result |
|---|---|
| test/node/runtime-service-bound-route.test.js (U) | ok, 33 |
| test/wasm-service/bound-creation-handler-embedding.integration.test.js (N) | ok, 3 |
| test/wasm-service/wasm-service-lifecycle.test.js | ok, 62 |
| test/node/runtime-service-handler.test.js | ok, 38 |
| test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 |

## Lab selection: `scratchpad/reports/lab-selection-r3.txt`, 18 files, all existing and primary-classified

How the list was built:
- `select-proof-cone.js --changed <file>` escalates to the full suite (2409) for every touched
  file. The reason it gives is `selector_input_missing`: "coverage snapshot.fileDigests must
  exactly bind its coverage edges".
- So I used the generated import graph, `test-output/analysis/global-owner-debt-import-graph.json`.
  The list is:
  - the test importers of the route and handler (through test-only helpers), plus the importers of
    the embedding fixture;
  - one production hop through `runtime-service-handler-setup.js`, the handler's only production
    construction;
  - the three edited tests;
  - the new contract's tests (P).
- The full transitive closure through src is 167 tests. That wider cone is the lab's call.

## F-items

- **F-r3-1 (RV5.5):** `events` is not unread.
  - The shared helper `deliverScheduled` (`wasm-strong-write-native-fixture.js:37-38, 54-70`)
    writes into it on every delivery (`record(f, ...)`), so dropping it throws a TypeError.
  - Removing it means replacing that shared reader with a local delivery loop, which is outside
    E's minimal change and a likely clone. I stopped there.
  - `held`, `phase` and `holdResponses` are dropped. `holdResponses` undefined is falsy, so `held`
    is never read; `phase` is recorded as undefined into an unread sink.
- **F-r3-2 (RV5.1):** a HELD memo without an `operationId` is still possible.
  - It can only come from `registerExistingReplica`, since every route-written HELD memo is named.
  - For that case the re-entry falls back to the request's id (`?? params.operationId`, :195).
  - The lead may prefer a typed refusal.
- **F-r3-3:** the brief's path `scripts/checks/check-fast-static.js` does not exist. I ran
  `scripts/check-fast-static.js`, the same command round 2 used.
- **F-r3-4 (RV5.6):** the coupled pair needs a contract of the same name, because the registry
  fails an unknown contract. I added one new contract, rather than widening
  `service-consensus-retained-native-bootstrap`.
- **F-r3-5 (D):** the lifecycle witness assigns a stand-in `consensusCreation` to an unbound replica
  rather than opening a real bound creation. Every predicate the latch uses reads only the token
  and `servicesRow`.

## Not run

- The lab, which belongs to the lead.
- The other lab-selection files locally.
- The base tree. The base comparisons for duplication and unused exports are the round-2 base logs.
- `test:file` on `wasm-creation-genesis`, `-reconciliation` and `-retained-bootstrap`: their
  sources are untouched this round.
- N was not re-run under the A, B, C and D mutations; U is their designed catcher.
