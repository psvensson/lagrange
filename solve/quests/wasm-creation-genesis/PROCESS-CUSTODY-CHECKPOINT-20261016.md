# Process custody prerequisite: first cloud implementation checkpoint

Status: WIP, not independent source approval or whole-Quest acceptance.
Parent: a1a22bdd5ed08c7d8009218f57559e4f92a18dc5. Original creation/genesis
handover and its tests remain unchanged. The user requested continuation toward
rs-raft main readiness using the newly connected local lab.

## One bounded interaction

This implements only R2's approved process-custody prerequisite across the
existing data-directory process owner, startup acquisition ledger and startup
registration. SQLite remains the exclusive-ownership authority. The owner keeps
its acquired SQLite handles strongly reachable until explicit release or process
death. This is local handle custody, not another ownership decision or lease.

Runtime shutdown releases the directory only after its existing shutdown promise
fulfills. A rejection remains a rejection and retains the lock. The existing
shutdown owner memoizes that promise; the wrapper adds no retry or second shutdown.
Startup unwind attempts every ordinary cleanup in reverse acquisition order. Only
if all succeed does it attempt the separately marked exclusive-owner releases.
The production startup registration now marks its directory release accordingly.
A falsy JavaScript rejection is still a failure. Repeated unwind never reruns a
possibly effectful cleanup. Acquire-before-abort and register-before-abort remain
unchanged. Failed teardown recovery remains process termination followed by
ordinary retained startup, not a timeout or another local grant.

## First real lab result before production changes

Exact source a1a22bdd5ed08c7d8009218f57559e4f92a18dc5, lenovo-laptop,
private bridge request cc5cdd751fb74b649e2c03f4f1af9f55. COMPLETE/exit 1.
The existing classified planner, placement lock and thermal checks ran; retry=0.
Two existing independently approved files were used without edits:

- startup-failed-cleanup-process-custody.test.js: 2 cases, 1 pass / 1 fail,
  497 ms whole-file wall time. Named failure:
  STARTUP_RELEASED_PROCESS_CUSTODY_AFTER_FAILED_CLEANUP.
- creation-recovery-process-custody.test.js: 3 cases, 1 pass / 2 fail,
  1499 ms whole-file wall time. Both named failures:
  SUCCESSOR_ADMITTED_WITH_UNRELEASED_OLD_RESOURCE.

The actual second process acquired ownership while the old real SQLite handle
remained open. Both healthy controls passed. No missing-symbol, setup or timeout
failure is counted. Raw executor log: 9852 bytes, SHA256
b1fbfe664d66cc78e70f4af33a4ff01654ef418146c5fdd9526ef33f904d2bd9.
The local bridge retains that raw log; cloud evidence is bounded redacted text,
not a byte-identical re-export. This is component/process-lock evidence, not
successor runtime overlap, native RF3 recreation, data loss or power-loss proof.

## First static attempt

The normal staged pre-commit hook ran on the actual candidate worktree.
File-size, hot-path diagnostics, staged constants, scoped ESLint, literal,
decision-boundary, ambient-intrinsic and silent-catch checks passed. Scoped
complexity reported zero violations in the three changed production files.
The complete hook exited 1: canonical full owner-debt regeneration exhausted
Node's heap in check-duplication.js. Its original output is retained as
process-custody-precommit-first.txt. This is an apparatus/resource failure,
not a semantic negative or a green global static gate. No heap, timeout,
threshold, baseline or test definition was changed in response.

The canonical --refresh-import-graph-only producer subsequently succeeded and
updated the tracked impact-graph seal. That closes only this graph refresh;
full debt-inventory freshness and the whole static gate remain open. Source
preservation uses the documented non-main WIP exception, not Solver landing.

## Candidate acceptance still pending

Same-host identical-test candidate proof, adjacent startup/shutdown/physical
identity coverage, canonical metadata/static checks and independent exact-source
review must follow. Strong handle custody, falsy rejection and the production
startup registration need explicit final proof coverage; the two focused tests
alone do not certify these additional obligations.

No test/timeout/ratchet was changed. No creation selection, grant, genesis, writer
completion, F1 ordering, native runtime, FreshMG, snapshot installer or release
protocol is implemented or activated by this checkpoint. Main and shared staged
work were not accessed for writes. Existing Quest receipts stay false.
