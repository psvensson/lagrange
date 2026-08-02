# Handoff: native call-cell invocation (minimal-deployment-call-cell-invocation)

Date: 2026-08-02. Repo HEAD: `6e361c1a6`. Base commit for all diffs below: `6e361c1a6d74a4dafde51c2ffbc3a116d7b38962`.

## Where the work actually lives (read this first)

The implementation is **complete and verified in the working tree**, but the
Solver quest log is in a sealed-integrity knot. **A new session should NOT try
to fight the solver log byte-by-byte.** The fastest honest path is:
**park the current parent quest, open a successor with `--from`, and use
`inherit-candidate` to carry the already-verified bytes into the child cleanly.**
See "Recommended next move" at the bottom.

## Verified-good state (do not lose this)

- File-size ratchet: **28/28 source** (green), 21/21 test. Keep it green.
- Scenario harness `node scripts/checks/run-minimal-deployment-call-cell-invocation-scenarios.js`
  → **PASS 8/8 guard files** (113 assertions). Latest report:
  `test-output/reports/minimal-deployment-call-cell-invocation-2026-08-02T17-45-22-045Z.report.json`.
- Runtime guard tests green: call-cell-worker 46/46(+reduce-coordinator+batch = 55/55),
  request-path regression 15/15, driver contract 82/82.
- eslint clean on all candidate src files.
- Fresh independent verifier **APPROVED the current (post-extraction) bytes**:
  session `ses_03c740282ffeP9X5wwy2SVhxLj`, aggregate fingerprint
  `sha256:771e6a9ebd4b1644e99630e6eb78f8df2ed48cf7b6f178c332e3afb3802f80d7`
  (recomputed byte-for-byte over the 19-path candidate, behavior-preserving
  extraction confirmed). An earlier verifier `ses_03c82081fffeakkbP014XMkb1e`
  approved the pre-extraction bytes with the SAME aggregate fingerprint
  (fingerprint is over file contents, and the extraction is content-neutral).

## The two quests

1. **`minimal-deployment-call-cell-invocation`** (parent, runtime+ingress) —
   status SOLVED but landing is blocked. 4 frontiers: call-invocation-ingress,
   -routing, -runtime, -reduce. Attempts recorded: attempt-1.diff (runtime, on
   frontier call-invocation-reduce, event idx 9), attempt-2.diff (ingress,
   idx 13/17).
2. **`minimal-deployment-call-cell-invocation-orchestration`** (child,
   wiring/invoker layer) — status open. Was rejected once (dead-code wiring +
   wire-contract contradictions: adapter returned bare string vs invoker needing
   `{componentResult, partials, replicaId}`; receiver hardcoded exportName 'run'
   and dropped payload.batch). Wire-contract fixes landed as its attempt-2
   (8/8 green). The **production-wiring rejection ground is still UNFIXED and
   deliberately deferred** (see below).

## The knot (why landing is blocked) — the key lesson

`attempt-1.diff` was recorded (sealed) with identity
`sha256:00e94d59…` (size 101040) = the **pre-extraction** bytes, where the
driver's call-cell logic was INLINE in `wasm-component-driver.js`. After that
recording, the driver call-cell logic was **extracted** into
`src/runtime/call-cell-driver-invoke.js` to satisfy the 800-line file-size
ratchet. That changed `attempt-1.diff` on disk to `sha256:22b6a9ab…`
(size ~102704, includes the new module). The terminal audit
(`acceptedChangeArtifactViolations` in `scripts/solve/integrity.js`) recomputes
the diff-artifact file hash and flags
`accepted changeRef artifact identity changed: …/attempt-1.diff`.

This is a **content-hash mismatch on the .diff file itself**, NOT a formal
violation event — so `replacesViolationIds` cannot clear it, and
`correct-attempt-base` refuses it ("sealed change artifact has drifted" /
"an exact verifier receipt already covers the attempt"). Re-recording a fresh
accepted attempt (`solve attempt` / `step`) is currently **blocked by
scope-pressure** ("changed-file count exceeds the limit; land or split first").

### Lesson: never edit a sealed .diff artifact after recording
The extraction should have been done as a **new attempt** (or the file-size
refactor done before the first recording), not by mutating the already-sealed
`attempt-1.diff`. Once a changeRef is recorded with `integrityAccepted`, its
bytes are sealed.

## Critical recovery note (a git mistake to avoid repeating)

While attempting to "restore the pre-extraction bytes" I ran
`git checkout -- src/runtime/wasm-component-driver.js src/runtime/call-cell-driver-invoke.js`.
Because `call-cell-driver-invoke.js` is **untracked-by-HEAD but staged-added**,
`git checkout --` EMPTIED it (no HEAD version) and reverted the driver to
committed state — destroying both. Recovery was done by:
`rm -f src/runtime/call-cell-driver-invoke.js` then
`git apply --include='…wasm-component-driver.js' --include='…call-cell-driver-invoke.js' solve/changes/minimal-deployment-call-cell-invocation/attempt-1.diff`.
The sealed diff is the source of truth and restored the verified state.
**Lesson: `git checkout --` / `git restore` on staged-new files is destructive;
recover from the sealed .diff via `git apply --include=`, not from git.**

## Production-wiring gap (the deferred verifier-rejection ground)

Nothing in the production bootstrap assembles the call-cell path:
- `CallCellInvoker` / `createCallCellRoutingSurface` are not wired in
  `src/bootstrap/bootstrap-api.js`.
- `callBindingRouteResolver` is not injected into `RuntimeServiceHandler`
  (`src/bootstrap/shared/runtime-service-handler-setup.js`).
- coordination-store DDL for the reduce lease/snapshot is not created.

This is a **separate, larger concern** (bootstrap composition + invoker
assembly + multi-node reduce evidence) and was deliberately deferred. It needs
its **own quest**, not a bolt-on.

## Recommended next move (new session)

1. Verify the working tree is still the verified state:
   `npm run audit:file-size` (want 28/28), run the scenario harness (want 8/8),
   `git rev-parse HEAD` (want 6e361c1a6).
2. `node scripts/solve.js park --id minimal-deployment-call-cell-invocation`
   (EXHAUSTED, scope/amend budget) with a reason referencing the sealed-artifact
   drift.
3. `node scripts/solve.js new … --from minimal-deployment-call-cell-invocation`
   to open a successor that re-seals the SAME post-extraction work cleanly.
4. `node scripts/solve.js inherit-candidate --id <child> --from minimal-deployment-call-cell-invocation`
   — it re-records the parent's approved candidate into the child and REBUILDS
   the approval against the child's own candidate projection; if the fingerprint
   matches (`sha256:771e6a9e…`), it carries the approval without re-running
   verification. (Read `scripts/solve/inherit-candidate.js` header first —
   it copies artifacts as `inherited-<parent>-attempt-N.diff` and does NOT
   support commit: changeRefs.)
5. Land the child with verifier `ses_03c740282ffeP9X5wwy2SVhxLj`,
   fingerprint `sha256:771e6a9ebd4b1644e99630e6eb78f8df2ed48cf7b6f178c332e3afb3802f80d7`.
6. Open a THIRD quest for the production wiring (bootstrap + RuntimeServiceHandler
   injection + multi-node reduce evidence) — the remaining rejection ground.
7. The orchestration child quest still needs its own verify+land once the parent
   chain is resolved.

## Repo gate reminders (cost time every session)

- Scope pressure: 25 files / 6 owner areas / 262144 bytes per attempt.
- File-size: `npm run audit:file-size`, src cap 800 lines (ratchet), test 1500.
- Literal guideline: `node scripts/check-guideline-literals.js` — no raw strings
  outside named frozen consts.
- tap helper misparses `assert.rejects` validation fns as SKIP → use `t.rejects`
  or `.then(ok, err)`.
- amend limit is 2 per quest (then park + successor via `--from`).
- Contract quests touching `architecture/` are `class: product`; product-quest
  diffs may not contain `solve/` workflow paths (except own-quest bookkeeping).

---

## UPDATE 2026-08-02 (evening session): parent chain RESOLVED, orchestration REJECTED

- **Successor `minimal-deployment-call-cell-invocation-v2` LANDED** as commit
  `5c374e6c8` (fingerprint `sha256:771e6a9e…`, verifier ses_03c740282ffeP9X5wwy2SVhxLj).
  Route taken: candidate-scope approval re-record on the parent (inherit-candidate
  requires `candidateApproval`, and only scope `candidate|both` counts — the recorded
  `aggregate`-scope approvals did not) → `new --from` (fix the retargeted scenario
  args back to the parent scenario before first execution!) → `run --max 1` declares
  + records the terminal → `inherit-candidate` → scope precommit (owners=7>6) cleared
  via `solve override --guard scope` + one override-admitted re-admission attempt
  (same diff, byte-identical union → identical gate message) → re-record candidate
  approval → `land` (committed with pathspecs).
- Also: `src/runtime/call-cell-driver-invoke.js` had lost its `git add -N` after the
  recovery; without it the candidate cannot fingerprint ("cannot fingerprint
  untracked paths").
- **Parent quest retired**: altitude reflection + parked routing/runtime frontiers
  (exhausted, operator) citing the sealed-artifact drift and the v2 supersession.
- **Third quest drafted** (not yet sealed): `minimal-deployment-call-cell-production-wiring`
  (bootstrap assembly + RuntimeServiceHandler injection + coordination DDL +
  multi-node reduce evidence).
- **Orchestration quest: fresh independent verification REJECTED the 9-path candidate**
  (`sha256:e7811ba4…`, verifier subagent:a16a6517f825e7f7f, recorded on the log).
  Key grounds: (1) response-side wire contract contradictory — receiver returns
  `componentResult`, adapter reads `delivery.componentResponse`, so the sanctioned
  path always throws on success; (2) CallCellStatementAdapter/routing-surface have
  zero executable evidence — the live test uses a bespoke in-test adapter;
  (3) guest partial-shape translations exist only in the test shim; (4) reduce lease
  never acquired by the candidate (test-only coordinator wrapper with fabricated
  replica ids); (5) `Date.now()` invocationId collides under concurrency (UUID
  contract helper unused); (6) live-evidence engine has partition execution stubbed.
  The fix round is real implementation work and partially overlaps the deferred
  production-wiring scope — decide fix-here vs re-decompose before attempting.

## FINAL 2026-08-02 (late evening): orchestration REPAIRED and LANDED

- The rejected orchestration candidate was repaired in place and landed as
  **`minimal-deployment-call-cell-invocation-orchestration-v2` → commit `e723e30f5`**
  (17 paths, fingerprint `sha256:36e6a27d…`, verifier subagent:a16a6517f825e7f7f
  re-verified all seven rejection grounds dead and APPROVED).
- Key repairs: adapter reads `componentResult` (new fail-closed guard test);
  invoker seeds coordination rows (`seedInvocation`, new coordinator INSERT
  surface) + acquires each slot lease + publishes the EMITTED partials
  (numeric aggValue JSON, `normalizeEmittedPartialEntries` fail-closed) + UUID
  invocation identity + maps gate-merged tuples for reduce; guest emits numeric
  partials; live test drives the fully real path (routing-surface factory,
  real dispatcher, real RuntimeServiceHandler via registerWithRouter, real
  driver invokeCallCell over the WASI worker, real per-partition SQLite behind
  the real query executor). Driving the real path exposed + fixed a latent
  receiver bug (raw `call` instead of `admittedCall` broke the pre-invoke
  route re-assert).
- The OLD orchestration quest hit a **mixed-base knot** (v2's landing moved
  HEAD under its attempts 1-2; "landing candidate requires one recorded common
  Git base"; correct-attempt-base rightly refuses since repaired paths no
  longer reproduce the sealed old deltas). Retired solved + altitude
  reflection; superseded by the -v2 successor. **Lesson: land or park
  dependent in-flight quests BEFORE landing a sibling that moves their base.**
- Verifier's non-blocking follow-ups for the production-wiring quest:
  call-cell-world-abi.test.js runs ~25s against a 30s tap timeout (flake risk
  under load); seedInvocation leaves orphaned coordination rows for failed
  invocations (ops cleanup); full ServiceRuntimeLifecycle envelope composition
  remains the wiring quest's scope.
- Remaining open scope: `minimal-deployment-call-cell-production-wiring`
  (drafted, unsealed).
