# Verifier verdict, stage 1c round 7 (pre-commit repair, take 2): `writeAndObserve` with a named write-attempt record

Independent adversarial verifier (Fable). Subject: `git diff 4bcf5f86d f518f3566 -- src test` = `writeAndObserve` /
new `attemptWrite` in `src/service/service-consensus-creation-intent.js` (24 lines: 17 insertions, 7 deletions) plus
the refreshed `test/shards/impact-graph-seal.json`; the lead's documents and retained evidence are excluded. Read in
`/mnt/data/peter/projects/.worktrees/verify-1c` detached at `f518f356615ddc1a81d5f1fd44287b6834ade551`
(`refs/heads/wip/rs-raft-serving-publication-8`; parent `4bcf5f86d` = my round-5 tree; `ab5c70255` was round 6),
then the import-graph refresh. Hard rules kept as before (no commit/stage/push/reset/clean/stash; refs untouched;
`git checkout -- <generated seal>` + `git checkout --detach` only; the one temporary file swap for the base comparison
and the one mutation restored by sha256; every run through `npm run test:file -- <file>` behind the thermal gate and the
no-other-runner guard; no lab host).

## 0. The delta, read

`attemptWrite(manager, query)` awaits `manager._operationWriter(sql, params)` and answers the frozen module constant
`WRITE_ACKNOWLEDGED = {acknowledged: true}` or `{acknowledged: false, error}`; it never throws. `writeAndObserve` awaits
it, then runs the one authoritative reread exactly as before; a successful reread answers the row (the write attempt is
dropped: the reread is the authority); a reread throw becomes the same `ServiceInstanceContractError(UNKNOWN)` with
`cause = {writeAttempt, readFailure}`. No nullable variable encodes state (V-F4 closed), no new throw path, no retry.
Callers unchanged: `reserveAndRetain` (:152), `prepareConsensusCreation` (:198), `claimConsensusCreationOpening` (:320),
each inside `try`/`instanceFailure`, which maps by `error.outcome` only; `requireObserved`/`confirmIntentRow` untouched.
Semantics are byte-equivalent for every caller except the `cause` on the double-failure UNKNOWN.

## 1. Statics (`r7/statics/file-statics.txt`)

| Check | Result |
|---|---|
| decision boundaries `--json` on the file | total 0, raw 0, inherited 0 (baseline 806 unchanged); base comparison: the round-5 bytes also 0/0/0 (swapped in, checker run, restored byte-identically). V-F4 CLOSED. |
| silent-catch on the file | 0 |
| eslint on the file | 0 problems |
| complexity / cognitive scoped (file) | 0 / 0 |
| literals (file) | 0 new |
| import-graph seal | the prescribed refresh REPRODUCED the committed seal (snapshot `86ba7d55...`; `git status --short` empty after the refresh). V-N26 CLOSED. |
| fast-static `--base b3793c7e5` (clean tree) | ok in 11.6 s (proof range b3793c7e5..HEAD); `git status --short` empty afterwards |

## 2. Runs (gated, serial; `r7/runs/`)

| File | Result |
|---|---|
| test/service/service-consensus-creation-intent.test.js | ok, 24 (incl. "resolves an applied intent/admission write with lost reply", "refuses reservation when intent write did not persist", "absent or unavailable journal cannot invent recovery intent") |
| test/service/service-consensus-creation-recovery.integration.test.js | ok, 2 |
| test/wasm-service/wasm-creation-publication.integration.test.js | ok, 25 (P11 green) |

## 3. Mutation by mechanism (`r7/mutations/`)

| Id | Mutation (mechanism) | Catcher | Result |
|---|---|---|---|
| MA | the lost-answer write is rethrown (`attemptWrite`'s catch rethrows instead of answering `{acknowledged: false, error}`) | service-consensus-creation-intent.test.js | KILLED: `not ok 4 - ServiceLifecycleManager resolves an applied intent write with lost reply`; `not ok 5 - ... admission write with lost reply` |

Restored byte-identically (`MA.sha-before` = restored sha256); `git status --short` empty after the chain.

V-N27 (the double-failure `cause` is diagnostic only, unreachable through `instanceFailure`; no witness drives write
throw + reread throw): the lead rules it recorded-diagnostic-only in the acceptance record. I agree: the `cause`
changes no decision (every caller maps by `outcome`), the lost-answer path that does decide is pinned and its witness
binds (MA), and a witness of the diagnostic would have to reach a module-internal function. Not a change for this stage.

## 4. Lab - PENDING

Round-7 changed cone queued as the job in `scratchpad/lab/stage1c/submit-r7.log` (request `a2c9de0c519541ffa89126544138cb01`,
lagrange-lab issue #172; 24 files, lenovo-laptop) at f518f3566; #171 withdrawn; #161-#163 (round 2) still queued. No
record under `~/.local/state/lagrange-lab/runs/` at hand-back.

## 5. What I did not read or run (counted)

Not read: the acceptance record, closeout-plan and quest-log edits, the retained evidence copies (lead's documents,
excluded). Not run: the base tree beyond the one-file checker comparison; any lab host; the handler/route and native
witnesses (U, N, H, genesis, reconciliation, retained, local-record, bound-native: their sources are untouched since
round 6, where the six named natives were green on the same function's previous shape); the lab selection locally
beyond the three files above.

## 6. Verdict

**PROVISIONAL (lab PENDING). On this delta: APPROVE.** The repair closes the inherited silent catch without a nullable
state (V-F4 closed: 0/0/0 on the file, equal to the round-5 bytes), keeps the function byte-equivalent for every
caller except the diagnostic `cause` on the double-failure UNKNOWN, is pinned on its deciding path by the lost-answer
witnesses (MA killed), leaves every file-scoped static at zero, passes fast-static on the base range, and the committed
seal is reproduced by the refresh (V-N26 closed). V-N27 stays recorded as diagnostic-only, which I agree with.

No finding. This is the verifier's record; the lead records the verdict and decides the round. Not reported as done on
anyone's behalf.
