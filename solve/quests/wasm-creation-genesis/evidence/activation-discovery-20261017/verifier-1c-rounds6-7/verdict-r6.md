# Verifier verdict, stage 1c round 6 (pre-commit repair): `writeAndObserve` keeps a thrown write as the cause of a double-failure UNKNOWN

Independent adversarial verifier (Fable). Subject: `git diff 4bcf5f86d ab5c70255 -- src test` = one function,
`writeAndObserve` in `src/service/service-consensus-creation-intent.js` (9 insertions, 4 deletions); the lead's
documents and retained evidence are excluded. Read in `/mnt/data/peter/projects/.worktrees/verify-1c` detached at
`ab5c70255b47adc2090d9872b7e1e6be03e17fd7` (`refs/heads/wip/rs-raft-serving-publication-7`; parent `4bcf5f86d` = my
round-5 tree), then the import-graph refresh. Hard rules kept as before (no commit/stage/push/reset/clean/stash; refs
untouched; `git checkout --detach` only; the one temporary file swap for the base comparison restored by sha256; every
run through `npm run test:file -- <file>` behind the thermal gate and the no-other-runner guard; no lab host).

## 0. The delta, read

Before: the write callback's throw was swallowed by a comment-only `catch {}` (the silent-catch hit recorded in rounds 1
and 3 as inherited from b3793c7e5); the reread decided the row; a reread throw became `ServiceInstanceContractError(UNKNOWN)`.
After: the write throw is captured (`let writeFailure = null; ... catch (error) { writeFailure = error; }`); the reread
still decides the row; when the reread also throws, the same `ServiceInstanceContractError(UNKNOWN)` is thrown with
`cause = {writeFailure, readFailure}`; when the reread succeeds the write failure is dropped as before.

Semantics: byte-equivalent for every caller except the `cause` property on the double-failure UNKNOWN. No new throw
path (the only throw is still the UNKNOWN contract error), no retry, no changed outcome: the three callers
(`reserveAndRetain` :147, `prepareConsensusCreation` :193, `claimConsensusCreationOpening` :315) run inside
`try`/`instanceFailure`, which maps the error by `error.outcome` only (`service-instance-contract.js:107-109`), so the
`cause` never reaches a decision; `requireObserved`/`confirmIntentRow` after a successful reread are untouched.
`Error.cause` assigned post-construction is a standard own property.

## 1. Statics on the file (`r6/statics/file-statics.txt`)

| Check | Result |
|---|---|
| `check-guideline-silent-catch.js <file>` | 0 violations (the comment-only catch is gone) |
| eslint on the file | 0 problems |
| decision boundaries `--json` on the file | **total 1, raw 1, inherited 0**: `writeAndObserve` :93 `raw_null_empty_state_outcome` - "raw null or empty-state outcome assigned/declared for semantic target writeFailure" (system guidelines §4.5; R07). Base comparison (`r6/statics/db-compare.txt`): the round-5 bytes of the same file, swapped in and restored by sha256, answer total 0, raw 0, inherited 0; the round-6 bytes answer raw 1, inherited 0. **The violation is NEW with this delta.** |
| complexity scoped (file) | 0 over 12 |
| cognitive scoped (file) | 0 |
| literals (file) | 0 new |
| import-graph seal | the refresh MODIFIES the committed seal (`sourceDigest 7c7b1dc6... -> 5c937048...`, `snapshotDigest 86f21e7f... -> 29421173...`): the committed seal at ab5c70255 is the round-5 seal and no longer binds the round-6 source (the one-function change was committed without `test:metadata:refresh`). Same class as V-N19; `solve land` refreshes it. Reported, not blocking. |

`node scripts/check-fast-static.js --base b3793c7e5` on the clean tree: ok in 11.4 s (proof range b3793c7e5..HEAD). fast-static has no decision-boundary stage, so it does not see the hit above; the pre-commit hook's silent-catch stage is satisfied.

## 2. Runs (gated, serial; `r6/runs/`)

| File | Result |
|---|---|
| test/wasm-service/wasm-creation-local-record.test.js | ok, 9 |
| test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 (P11 green) |
| test/wasm-service/wasm-creation-genesis.integration.test.js | ok, 14 |
| test/wasm-service/wasm-creation-reconciliation.integration.test.js | ok, 4 |
| test/wasm-service/wasm-retained-bootstrap.integration.test.js | ok, 16 |
| test/wasm-service/wasm-creation-bound-native.test.js | ok, 3 |
| test/service/service-consensus-creation-intent.test.js (the function's own witness file; added by me) | ok, 24 |
| test/service/service-consensus-creation-recovery.integration.test.js (added by me) | ok, 2 |

## 3. Mutations by mechanism (`r6/mutations/`)

| Id | Mutation (mechanism) | Catcher(s) | Result |
|---|---|---|---|
| MA | the lost-answer write is rethrown (`writeFailure = error; throw error;`) | service-consensus-creation-intent.test.js | KILLED: `not ok 4 - ServiceLifecycleManager resolves an applied intent write with lost reply`; `not ok 5 - ... admission write with lost reply` |
| MB | the reread failure returns null instead of throwing UNKNOWN with `cause` | service-consensus-creation-intent.test.js; wasm-creation-publication.integration.test.js | SURVIVED both (outcome-equivalent: the callers' `requireObserved`/`confirmIntentRow` turn a null row into the same UNKNOWN; no witness drives the double-failure path; the `cause` is unobservable through `instanceFailure`) |

Both restored byte-identically (`*.sha-before` = restored sha256); `git status --short` after the chain shows only the refreshed seal.

Witness coverage of the two paths: the lost-answer path (writer throws after applying) is pinned by
`service-consensus-creation-intent.test.js` "resolves an applied intent/admission write with lost reply" (`setJournalFault('after-intent'|'after-admission')`
-> ADMISSION_RETAINED, one write event, row IN_PROGRESS). The double-failure path (writer throws AND the reread throws)
has NO witness: no test combines `setJournalFault` with `setReadFault`; and because `instanceFailure` maps the thrown
error to `{outcome: UNKNOWN}` and the callers' own `requireObserved`/`confirmIntentRow` also answer UNKNOWN for a null
row, a mutant that returns null instead of throwing is outcome-equivalent through the manager API: the `cause` is a
diagnostic property reachable only by a test of the module-internal function. Recorded (V-N27); a witness may be added
through a caller that surfaces the error, or the gap recorded as diagnostic-only.

## 4. Lab - PENDING

Round-6 changed cone queued as the job in `scratchpad/lab/stage1c/submit-r6.log` (request `627cd615575a4479858d1243036cb0d5`,
lagrange-lab issue #171) at ab5c70255; #170 withdrawn; #161-#163 (round 2) still queued. No record under
`~/.local/state/lagrange-lab/runs/` at hand-back.

## 5. What I did not read or run (counted)

Not read: the acceptance record, the closeout-plan and quest-log edits, the retained evidence copies (lead's documents,
excluded). Not run: the base tree beyond the one-file checker comparison; any lab host; the handler/route witnesses (U,
N, H: their sources are untouched this round); the lab selection locally beyond the eight files above.

## 6. Findings

### V-F4 (REQUIRED; guideline-audits R06/R07, system guidelines §4.5; the brief's own criterion "decision boundaries --json on the file: 0 new") The repair introduces one new decision-boundary violation
- `writeAndObserve` :93 `let writeFailure = null;` encodes the runtime state "no write failure" as a raw null that the second catch then reads into the UNKNOWN's `cause` (`raw_null_empty_state_outcome`, semantic target `writeFailure`). Round-5 bytes: 0 violations in this file; round-6 bytes: 1, inherited 0. Policy (test/guidelines/proof-ladders.md "Static Guardrail Preflight And Closure"): a touched production file with a new decision-boundary violation cannot close; fast-static does not run this checker, so the land gate would not catch it.
- Required change (one token to one line, the lead's shape): name the state instead of null - for example a frozen module-owned sentinel for the acknowledged write (the `WASM_SERVICE_NO_FAILURE` pattern already used by the WASM replica, R06), or a named record `{acknowledged: true}` / `{acknowledged: false, error}` for the write attempt, or build the `cause` without a nullable variable (capture the write error only inside the read catch's closure). Re-measure: the file-scoped decision boundaries (0), silent-catch (0), eslint, and `service-consensus-creation-intent.test.js`.

### V-N26 (recorded; metadata) The committed `test/shards/impact-graph-seal.json` at ab5c70255 is the round-5 seal; the one-function source change was committed without `test:metadata:refresh`, so the prescribed refresh rewrites its digests (same class as V-N19, closed in round 5 and reopened here). `solve land` refreshes it; reported so the land step is not surprised.
### V-N27 (recorded; witness gap) The double-failure path (write throws AND reread throws) has no witness, and its only new observable (`cause`) is diagnostic: unreachable through `instanceFailure`. Mutant MB survives for that reason. A witness through a caller that surfaces the thrown error, or a recorded "diagnostic only" note, closes it; not blocking.

Checked and sound: the function's semantics are byte-equivalent for every caller except the `cause` on the double-failure UNKNOWN (no new throw path, no retry, no changed outcome); the lost-answer path is pinned and MA proves the witness binds; the six named files plus the function's own two witness files are green; silent-catch 0; eslint 0; complexity 0; literals 0; fast-static ok.

## 7. Verdict

**PROVISIONAL (lab PENDING). On the one-function delta: REJECT, narrow - the repair is semantically sound and closes the silent-catch hit, but it trades one guideline violation for another: a new decision-boundary violation (V-F4, raw null encoding the no-write-failure state) in a touched production file, which the brief's criterion (0 new) and the closure policy both forbid. One-line fix; re-measure the file's statics and its witness file.**

Recorded, non-blocking: V-N26 (committed seal stale again; land refreshes), V-N27 (double-failure path unwitnessed; `cause` diagnostic only).

This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on anyone's behalf.
