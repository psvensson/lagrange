# U1 continuation — same-source regressions, corrected fixture, residual cone

**Recorded 2026-10-20.** Read-only evidence review; the current U1
source `be25caa5f0c3612feec662d4feaa9ba28f8f34df`
remains frozen. No U1 combined approval, new native distributed
certification, or merge to `main`.

## High-confidence owner results

1. **Generic runtime-service REPLACE fixture** was genuinely
   affected by the U1 deferred journal-read interface. On exactly
   the same unmodified test blob, predecessor 381750de PASS twice,
   U1 candidate FAIL twice. Git bisect anchored the first failing
   commit to
   `9514ba8bf115d7a5fec919d123422bc9202b586c`
   ([bisection #39415294615](https://github.com/psvensson/lagrange/actions/runs/39415294615)).
   The controller's `RUNTIME_SERVICE_CREATE_FAILED` with
   `UNKNOWN` was caused by the old in-process manager fixture's
   missing `readRetainedCreation` method. The actual
   `ServiceLifecycleManager` implements this method and answers
   a typed outcome. This is a **fixture interface gap**, not yet
   evidence of a real production CREATE corruption.
   An initial diagnostic with unimported test-only `assert`
   produced a separate error; it was corrected before any
   positive credit. A test-only `readRetainedCreation()` returning
   **`UNAVAILABLE`** accurately models this fixture's missing
   journal without fabricating `INTENT_NOT_FOUND`.

   The clean correction has only ONE changed tracked file in the
   test/source scope:
   [`work/u1-replace-fixture-v2-20261020`](https://github.com/psvensson/lagrange/tree/work/u1-replace-fixture-v2-20261020)
   SHA `1452846885fe0646fd0ed5bff1746075c8ff9502`,
   exact corrected test blob
   `52c2f9439db9daf1c965d813664dbfd7441ccb81`.
   Its public-generic REPLACE result is **PASS 1/1, 12 runner
   assertions** at that exact corrective SHA:
   [Actions #39419638239](https://github.com/psvensson/lagrange/actions/runs/39419638239).
   An earlier lint-fixed tree with identical source/test content
   passed the canonical metadata refresh, scoped ESLint and
   **fast-static**:
   [Actions #39419069840](https://github.com/psvensson/lagrange/actions/runs/39419069840).
   The producer classified **2,413** test files and 22 subsystems.
   The final clean branch has no diagnostic workflow or production
   source file, and is intentionally NOT incorporated into
   the frozen U1 implementation until independent oracle approval
   and exact composed gate verification.

2. **STOPPING REPLACE source-membership redrive** was red in the
   crowded full GCP corpus, but BOTH old and U1 candidate ran green
   under isolated hosted Node 22 for the same original
   `replace-replica-workflow.test.js` file. A bisect attempt
   properly stopped at its required candidate-RED precondition
   ([Actions #39415294615](https://github.com/psvensson/lagrange/actions/runs/39415294615)).
   The red GCP log showed a real
   `source_membership_removal_pending` retry scheduled for 1000ms
   while the fixture awaited no more than 200 immediate-loop turns
   for `REMOVE_PEER` witness delivery. Do NOT infer an accepted
   duration requirement or hide an event-driven wake failure by
   arbitrary timeout extension. The next owner check should
   measure the actual progress/retry handoff deterministically.

3. **The two formation / user-write tests are not stable newly-red
   U1 comparisons.** A second matched GCP run exercised both
   original test files TWICE on each source (8 runs) on the SAME
   self-hosted GCP CI VM. Every run was RED on both old and U1
   [Actions #39416252319](https://github.com/psvensson/lagrange/actions/runs/39416252319).
   The two write-test sources both failed at
   `seed bootstrap should succeed` with participant-release
   authority unavailable, followed by missing
   `schema_operations`. Both versions of the consumer-ratchet
   test timed out during one embedded-node formation, with
   heavy failed CDC-update warnings. This is a shared upstream
   formation/release obligation that needs owner-level diagnosis;
   it is NOT a demonstrated four-for-four reproducible U1
   behavioral regression. The run's GCP shutdown was confirmed
   `U1_FORMATION_GCP_STOP=TERMINATED`. Original logs:
   [artifact 12261953351](https://github.com/psvensson/lagrange/actions/runs/39416252319/artifacts/12261953351).

## Beyond file-level RED vs GREEN

The complete [GCP selected-cone run #39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
executed **1,898/1,898**, 1,779 PASS and 119 FAIL.
All 119 test-file Git blobs were unchanged from the predecessor.
The matched first named failure comparison yields:
- **102** files with the same initial recorded failure text,
- **13** with differing first text. Several are randomized
  property seeds or TAP duration differences; these do not
  immediately establish changed owner behavior.
- **Causally interesting differences remain** in
  `test/query/write-path-internal-pacing.test.js`
  (participant cutover pressure vs no available leader),
  `test/raft/raft-rs-backend/single-path-partition-cutover.test.js`
  (durable log witness vs seed-serve precondition),
  `test/bootstrap/node-bootstrap-consistency.property.test.js`
  (timeout vs seed bootstrap refusal),
  `test/integration/multi-node-raft-replication.integration.test.js`
  (join-cache observation vs seed bootstrap refusal), and
  `test/integration/three-node-seed-rebalance.integration.test.js`
  (seed failure vs seed timeout). Same file-level RED is NOT
  evidence that these different first causes have identical
  semantics; route each to its actual owner without assuming
  U1 caused or cleared it. The Raft leader-election test also
  exceeded its timeout at both sources, but by different amounts.

The U1 V4 ordinary retained-wake source-only control is still
proved independently at
[Actions #39405150063](https://github.com/psvensson/lagrange/actions/runs/39405150063):
one exact original-case positive PASS, one direct source mutant
RED at `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`.
It does not prove native physical-generation cleanup.

## Next finite execution gates

- Independently vet the exact one-file simulated journal-reader
  correction and compose it with the U1 branch **without
  overwriting** the frozen checkpoint; regenerate canonical
  metadata and prove all touched compatible consumers.
- Investigate **REMOVE_PEER witness wake and deferred retry**
  under controlled scheduling, not repeated full-corpus iterations.
- Attribute first causes for the five substantively changed
  historical RED cases to their authoritative owners.
- Reconcile the original 55-item U1 review and its physical
  currentness/native witnesses. Only an independently accepted
  completed review can unblock U2 and activation. The 119-file
  baseline/red corpus remains visible release debt.

All source GCP test infrastructure used existing GitHub-hosted
runners or the precommissioned self-hosted GCP runner with
explicit cleanup; no new multi-VM topology execution was claimed.
