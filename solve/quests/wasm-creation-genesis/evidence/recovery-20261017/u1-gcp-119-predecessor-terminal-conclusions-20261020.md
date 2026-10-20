# U1 complete predecessor differential — terminal conclusions, 2026-10-20

**Disposition: U1 combined acceptance STILL OPEN.**
All evidence concerns the immutable U1 candidate
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`
versus the sealed predecessor
`381750de29af647d446b19adedf1da53eb712093`.
No source or test was changed for this comparison.

## Original terminal GCP receipts

- Candidate [Actions run 39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
  ran all **1,898/1,898** required selected files with the original
  classified runner: **1,779 PASS; 119 FAIL**; 76,425
  runner-reported assertions. Candidate artifact
  [12256004857](https://github.com/psvensson/lagrange/actions/runs/39393585693/artifacts/12256004857).
  VM cleanup **PASS, TERMINATED**.
- Predecessor [Actions run 39405963549](https://github.com/psvensson/lagrange/actions/runs/39405963549)
  checked out the exact ancestor, verified **119/119** selected red
  paths were present, and ran all 119 through the ancestor's own
  canonical classified runner. Three lane/batch summaries were:
  **84 files: 2 PASS, 82 FAIL (2,821 assertions);
  9 files: 0 PASS, 9 FAIL (518 assertions);
  26 files: 2 PASS, 24 FAIL (722 assertions)**.
  Cumulative: **119 executed; 4 PASS, 115 FAIL;
  4,061 runner-reported assertions**.
  The GitHub job is marked **FAIL** because those tests actually failed.
  The last 26-file line alone is NOT the whole run.
  Raw original runner.log, 119 individual TAP files, and NDJSON
  are preserved in [artifact 12259321414](https://github.com/psvensson/lagrange/actions/runs/39405963549/artifacts/12259321414).
  The wake job **PASS** and teardown job **PASS**;
  cleanup printed `PREDECESSOR_CLEANUP=TERMINATED`.
- [Git object identity run 39408022963](https://github.com/psvensson/lagrange/actions/runs/39408022963)
  establishes all **119/119** failed test files have identical
  Git blobs at the predecessor and U1 candidate. No missing or
  rewritten test file accounts for these file-level differences.

## Comparative file-level result

**115 of the 119 failed-at-U1 files also failed against the
pre-U1 source. Four passed against the old source and failed at
the U1 candidate.** Exactly **four newly red files**, not 119
newly failing test files, were observed by this same-file
comparison. This does not prove there were only four newly
introduced *defects*: an inherited red file can gain a different
or additional failure and still be red.

The four files with predecessor **PASS → candidate FAIL**:

| Source/test owner | Exact file | Candidate's first material failure |
| --- | --- | --- |
| Rebalancer REPLACE | `test/rebalancer/replace-replica-workflow.test.js` | The owner does not appear to redrive `REMOVE_PEER` through the required witness, in the source-row-deletion/STOPPING case. |
| Runtime-service replacement | `test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js` | The production coordinator emits `Runtime-service REPLACE failed: UNKNOWN` instead of completing canonical target handoff. |
| Public consumer formation | `test/integration/public-consumer-contract-ratchet.integration.test.js` | Embedded one-node formation does not finish inside the 45-second (hardware-scaled) budget; its diagnostic mentions CDC update misses and deferred subscriber obligations. |
| Single-node write availability | `test/integration/single-node-default-replica-count-writes.integration.test.js` | Seed participant release fails to obtain the `current_control_owner_fact`; bootstrap is not ready and subsequent table/write/read checks fail. |

All four **test files themselves** have exactly the same Git
blob at both commits. The REPLACE cases need focused owner-
interaction review. The two formation cases may share an upstream
bootstrap/release readiness cause, but timing and first-error
differences preclude assigning one root without additional proof.

A lightweight first-TAP-failure-name comparison finds **102/115**
old-red files showing the same first recorded failing case name
*verbatim* in both runs, with **13/115** different recorded first
strings (some differences are randomized property seeds, elapsed
times, or test-framework formatting). This string comparison is
not an independent root-cause match; original per-file TAP logs
are definitive. Inherited **status** must not be upgraded to
inherited **cause** without checking owner and first substantive
outcome.

## Executed narrower controls/reviews

- [V4 wake source-only differential
  #39405150063](https://github.com/psvensson/lagrange/actions/runs/39405150063)
  passed the original positive oracle once and provoked exactly
  `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F` on a one-source-file
  wake-bit-removal mutant. This is bounded V4 lost-wake approval,
  not all physical generation/cluster progress claims.
- [Generic execution ACK source review](u1-final-generic-ack-source-independent-review-20261020.md)
  approves only one-owner exact duplicate admission semantics.
  It explicitly does not approve cross-host STOP generation/physical
  custody or whole U1.

## Next repair strategy and hard holds

1. **Reproduce and independently vet the two REPLACE owner
   interactions** (missing witness redrive and UNKNOWN workflow
   outcome), using their own first-effects/source-only discriminators.
   Note the U1 candidate includes other commits after the old
   baseline: `PASS→FAIL` is a regression *between the revisions*,
   not yet proof of U1's particular ten-file delta causing it.
2. **Classify the two one-node formation/writes failures**
   by tracing the real `current_control_owner_fact` owner and
   CDC/phase prerequisites. Do not raise timeout ceilings to
   hide a stalled causal handoff, or assume the two have one root
   without instrumentation.
3. For the 115 preexisting RED files, retain the correct original
   first-failure diagnoses and distinguish source-owner changes,
   including the 13 first-string differences. They remain
   **release/test-gate debt**, not automatic new-U1 blockers or
   waived assertions.
4. Re-freeze and execute the actual affected selection for any
   corrective source. Then obtain independent final source/oracle
   reviews, the original **55-item combined U1** verdict, and
   later real multi-machine topology proof.

**Not authorized by this result:** merge to `main`,
approval of U1 combined safety, starting U2/activation, or
promoting any physically unexecuted distributed scenario to PASS.
