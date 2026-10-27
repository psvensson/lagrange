# Process custody: author-review checkpoint, 16 October 2026

The operator explicitly requested this ChatGPT session to review between stages
and continue when the repair is accepted. This is author review, not an
independent subagent verdict. No sealed independent receipt is fabricated.
No main merge, Quest completion, or whole-release approval is requested.

## Reviewed input and verdict

Input 0cdf38556a4e11d35417c8378bfacf04f1a5ba18, tree
d5cc234333d7e1c5c770f87c643a3ddc861fea46. Verdict: REVISE before
accepting the complete process-custody prerequisite.

F1 (owner interaction / failure reporting): runStartupWithCleanup in
src/lagrange-runtime-startup.js discards the actual cleanup rejection with
catch(() => undefined). The directory is retained, but the caller sees only
the initiating startup error and cannot inspect the cleanup failure. R2
requires failure to be reported rather than hidden. Proposed correction:
when and only when unwind rejects, throw an AggregateError containing original
startup error first and actual cleanup rejection second, with cause equal to
the original startup error. A startup whose cleanup succeeds preserves its
original rejection unchanged. The public facade retains its existing startup
failure normalization and receives both causes; no new retry or runtime opens.

F2 (coverage / registry): the three touched owners and custody witnesses were
not registered in the existing public-application-database-seam impact
contract. Extend that contract, not a competing owner or test selector.

The lock correction itself retains native handles independently of dropped
wrapper objects. SQLite remains the exclusion authority. release() marks the
handle released only after close succeeds, so a native close failure remains
retryable and retained. The production shutdown owner already shares its
settlement; the wrapper cannot turn that rejected settlement into success.
The startup ledger is single-use; repeat unwind is deliberately a no-op,
not a receipt granting another process permission. Its sole production caller
awaits it once. No new generic single-flight or retry policy is needed.

## Frozen test-only stage before source changes

process-custody-review.integration.test.js plus its child exercise:
- Actual garbage collection of a discarded owner wrapper in another process,
  while a real contender must remain refused until that process exits.
- Actual startLagrangeRuntime through injected BootstrapAPI.initialize and
  shutdown failures, with a real SQLite handle opened by that collaborator.
  The parent observes the real directory lock. No startup/ledger/lock fake,
  synthetic grant, healthy cluster or native Raft quorum is claimed.
- A matched failed-startup/healthy-cleanup control: original error survives,
  the resource is closed and another process may acquire the directory.
- All five falsy rejection values; all ordinary cleanups attempted, no exclusive
  release, and no repeat effects.
- Injected native ROLLBACK and close failures on the exact held database;
  actual ownership persists until explicit successful release.

The GC proof requires actual WeakRef collection; no vacuous GC claim.
IPC readiness proves the child remains alive while the parent probes. Every
child has owned shutdown/kill and joined close before directory removal.
The twelve GC turns are bounded test apparatus, not product retries or a
runtime scheduling change. Test deadlines remain with the existing planner.
Expected source failure is the original/cleanup-error visibility assertion;
any startup setup/import/timeout failure is apparatus failure, not F1 proof.

## Review categories and scope

Owner interaction: existing startup/ledger/storage owners remain distinct;
the final physical exclusion decision is SQLite's, never the retention Set.
Admission: no flag or bypass; original healthy release is a paired control.
Concurrency: registration-before-abort and acquisition-before-abort stay
unchanged; no new queue or mutable latest-runtime lookup. Repeated failed
unwind does not authorize release or replay cleanup.
Recovery: termination, then ordinary retained restart; no time-based unlock.
Harness: collaborator faults and component/process proof are explicit; no
RF3, seed-loss, snapshot or full-corpus assertion. Same test bytes will be
used before and after correction. Source-only mutations must fail on the
actual lock/GC or error assertion, never merely a missing symbol.

Author design/oracle review: ACCEPT this bounded measurement and proposed
F1 correction. Source acceptance waits for the first lab results, correction,
controlled negatives and a post-result review. Existing static/debt inventory
and broad rs-raft failures remain separate holds, not silently waived.
