# Original terminal-custody execution 3723: independent interpretation

Reviewed the complete native output, retained request and provider records, and
the original witness/owner source. This is interpretation of an existing failed
execution; no workload was run or replayed during review.

The exact intended causal failure was reached: the real producer committed RED
with status 23 and closed; reconciliation then observed native ESRCH and replaced
that terminal record with its stale RUNNING-derived LOST record. This is now a
physical witness of terminal-state overwrite, beyond the earlier source finding.

## Source and custody

- Request: [3723](https://github.com/psvensson/lagrange-lab/issues/3723), logical
  ID `47e3cbb7-645e-46e0-ad92-0b1d6d87d5ec`, host `local-workstation`.
- Executed remote source `ea03848ea3a3c827415d77c17fc7e119ddae64df`, tree
  `19839265119c738e57664611378bf1c507a31aac`, src
  `ec5f4204f8031d859808495365fda27e831a5a72`. The request binds the exact-tree
  original witness to local `41639124b215b2624865639f06f0ef952c55a60e`.
- Full `original-3723.log`: independently rechecked 21,217 bytes and SHA-256
  `1228eff6d5a791a78dfd031501cd2ae4917730403b26b30aa33e347d4da2a020`.
  This matches the worker full-output claim, which says untruncated. The outer
  provider's 8,213-byte worker-tail summary is a different object, not the full
  stream used here.
- `terminal-intent.json` binds original production owner blob
  `6b4359edb79b3883d00317a5343c43944e439a1c`, original test root blob
  `4543b9202a57c3b6112b9ee2255bef8223749dff`, and child fixture blob
  `19f22c5d258db61089bf0883d8314b63e08e2182`.
- Initial source guard precedes the printed identity; final source guard exited
  0. Setup exited 0, native provenance exited 0, tests exited 1. Observed Node
  v22.23.2; SQLite 3.49.2, source ID and addon digest match the request's guards.
- Completion provider at `2026-11-13T12:10:25.781Z` reports FAIL/exit 1, with
  execution, container and thermal scopes closed. These closure facts are
  provider claims, independently distinct from the fixture child close events.

## Native cases and first causal divergence

TAP reports 19 cases: 18 passed, 1 failed; zero cancelled, skipped or todo.
The sole failed case is number 19, `reconcileLocalCorpus preserves terminal RED
committed after its RUNNING snapshot`, at the final byte-preservation assertion
in `test/scripts/local-corpus.test.js:863` (original witness starts at line 789).

The diagnostic and preceding assertions establish this order:

1. Production `startLocalCorpus` acquired the obligation and detached a real
   producer. `runLocalCorpus` wrote RUNNING for PID 3599521.
2. A separate reconciler captured the actual RUNNING bytes exactly once and
   waited at the read barrier.
3. The real controlled gate child exited 23; production wrote RED with status
   23 and `finishedAt: 1794571824664`. Parent observed producer close
   `{code:23,signal:null}` before releasing reconciliation.
4. Reconciliation called native signal zero for that same PID. The narrow
   instrumentation recorded exactly `{pid:3599521,signal:0,code:"ESRCH"}` and
   rethrew the actual error; it did not manufacture absence.
5. Reconciler closed normally `{code:0,signal:null}`, leaving LOST without the
   terminal status or finishedAt. SHA, PID, files, startedAt and log identify
   the same attempt; the final byte equality assertion then failed as intended.

The first incorrect production action is `publish-local-corpus.js:414` writing
LOST from the stale record returned at line 412. Native absence itself is correct.
The generic writer at lines 138-142 replaces the state via a shared temporary
path and unconditional rename, with no conditional predecessor check. The real
RED writer at lines 307-308 completed earlier. This demonstrates why a second
ordinary read would only move the race, rather than supply an atomic transition.

## Warnings and evidence ceilings

The stream contains npm deprecation/update notices and repeated test-output
retention warnings for absent `scripts/prune-test-output.js` inside deliberately
small publication fixtures. They remain retained diagnostics; they did not cause
the sole failing TAP case or prevent admission of the race witness. Their broader
fixture/retention significance is not resolved by this bounded review. Printed
push/remote activity belongs to those fixture repositories and is not production
publication evidence.

The gate workload is a finite real Node subprocess intentionally exiting 23;
the test does not execute a whole corpus. Its substituted command entry and
barriers provide deterministic interleaving while retaining real production state
writers, real child closure and native ESRCH. This establishes the RED/absence
race on the measured Linux host, not every terminal phase, crash point, OS, PID
incarnation, filesystem guarantee, receipt side effect or potential shared-temp
collision. It supplies no repaired-candidate verdict, full-corpus proof, Solver
land, native publication, canonical evidence upload or foundation acceptance.

The request's script retains a stale introductory `DRAFT ONLY. Not submitted`
comment. Actual provider admission, guarded source identity and complete output
establish that this exact bound payload was executed; the comment must not be
used to relabel the attempt as unsubmitted or justify replay.
