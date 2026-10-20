# U1 four apparent newly RED files — matched reproduction and owner disposition

Date: 2026-10-20. Read-only review of exact source/test evidence.
**Implementation candidate remains** `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
This is not U1 combined acceptance, publication authority or a waiver
of the 119 failing files in the full change cone.

The initial [119-file GCP predecessor comparison](https://github.com/psvensson/lagrange/actions/runs/39405963549)
found **115 RED at both commits and four GREEN at original predecessor
`381750de` but RED at the U1 candidate**. Test-file Git blobs were
all unchanged. A single historical PASS is not enough to call a
non-deterministic failure introduced by a particular commit.

## R1: Generic runtime-service REPLACE — reproducible fixture contract gap

The unchanged
`test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js`
passed twice at `381750de` and failed twice at `be25caa5` on GitHub
hosted Node 22. Original, explicitly preserved bisection
[Actions #39415294615](https://github.com/psvensson/lagrange/actions/runs/39415294615)
isolated the FIRST failing source commit to
`9514ba8bf115d7a5fec919d123422bc9202b586c`, the
explicitly unverified U1 reconstruction introducing deferred
per-operation journal hydration.

An existing coordinator observer
[Actions #39415825359](https://github.com/psvensson/lagrange/actions/runs/39415825359)
proved the actual terminal outcome is
`RUNTIME_SERVICE_CREATE_FAILED`, mapped to final `UNKNOWN`;
the test's original listener dropped the underlying producer reason.

A diagnostic-only owner exception trace
[Actions #39417172249](https://github.com/psvensson/lagrange/actions/runs/39417172249)
originally revealed an exception from a *diagnostic* fixture's
unimported `assert`; this was corrected within the diagnostic
branch and was never merged as evidence of a production defect.
After correction the same diagnostic case passed, and a clean,
test-only fixture source (no diagnostic production patch) also
passed.

**Actual gap:** U1's real `ServiceLifecycleManager` has the
`readRetainedCreation(operationId)` journal reader, whereas the
runtime REPLACE test's in-process simulated manager supplied only
`resumeConsensusCreation` and therefore threw at the missing
method on the U1 hydration path. The production route caught the
exception and reported `UNKNOWN`. The runtime definition in the
scenario is *generic* `native_js`, not bound-class
`wasm_component`; a typed `UNAVAILABLE` journal read routes the
generic operation through the existing generic owner. A bound-class
operation is separately deferred and never granted a fabricated
journal absence.

**Bounded correction:** one test-only source file on
`work/u1-replace-typed-reader-20261020`,
commit `ea5d4dde69890f461ed9fe88484de6f8f7f7fc32`,
adds a typed `readRetainedCreation()` returning
`{outcome:'UNAVAILABLE'}` to that simulated manager;
original workflow and outcome assertions remain intact and
`src/` bytes are unchanged. Its exact test blob is
`5bebfc3a3b2be847276613a41d3e43c0bbfc12da`.
[Clean-source test #39417961545](https://github.com/psvensson/lagrange/actions/runs/39417961545)
**PASS 1/1 file, 12 runner assertions**; the equivalent earlier
definitive-absence fixture probe also passed
[#39417760666](https://github.com/psvensson/lagrange/actions/runs/39417760666).
The correction is **not merged into the frozen U1 candidate**,
and needs the proper original-oracle review/metadata refresh before
composition. No bogus `INTENT_NOT_FOUND` absence proof should be
used in the final fixture, which models an unavailable journal.

## R2: REPLACE STOPPING membership re-drive — schedule-sensitive

`test/rebalancer/replace-replica-workflow.test.js` was
one of the four initially old-green/candidate-red files.
In the red GCP file, the first failed expectation is
`the owner re-drives REMOVE_PEER through the witness`. The
source-owner log names a pending membership removal and schedules
a `source_membership_removal_pending` retry with **1000ms** delay.
The test's own bounded wait uses **200 setImmediate turns**, not
a committed/witness-observed delivery or a wall-clock deadline.

On GitHub-hosted Node 22, the original source passed TWICE
and `be25caa5` also passed its first isolation attempt
([Actions #39415294615](https://github.com/psvensson/lagrange/actions/runs/39415294615),
first job). The source bisector correctly REFUSED because its
required final candidate RED was not reproduced. This is a
schedule-sensitive red; do **not** call it a stable product
regression or simply increase the 200-turn budget to hide an
event-driven wake defect. Investigate the owning retry/wake
handoff deterministically, with actual first dispatch and
witness effects, before any fixture or retry-policy change.

## R3/R4: One-node formation and user writes — both revisions fail
on repeated same-GCP-VM measurement

[Paired GCP #39416252319](https://github.com/psvensson/lagrange/actions/runs/39416252319)
ran BOTH source commits sequentially on the SAME existing GCP CI
VM with identical package-lock/test blobs and each of the two
formation files TWICE: **eight file executions, all eight RED**.

| Original unmodified test | Old commit | U1 commit |
| --- | --- | --- |
| `single-node-default-replica-count-writes.integration.test.js` | 0/2 PASS | 0/2 PASS |
| `public-consumer-contract-ratchet.integration.test.js` | 0/2 PASS | 0/2 PASS |

In all four write-test executions the first failed test case
was `seed bootstrap should succeed`; the producer logs record
`Seed participant release failed`, followed by
`Table not found: schema_operations` as a downstream symptom.
The initial candidate GCP corpus identified
`missingFact: current_control_owner_fact` in the control-partition
release path. This is upstream bootstrap ownership work, **not**
evidence of a failed user-table write implementation.

In all four consumer-ratchet executions, the first failed case
was single embedded runtime formation exceeding its 45s budget;
the first diagnostic repeatedly named hundreds of missed
CDC update rows and unavailable bootstrap peer/cache facts.
The old and current source show the **same failure family**,
with normal variable node IDs and warning counts. The repeat
establishes these two filenames are NOT reliably
old-green/new-red under matched resources. It does not
establish a safe release or rule out a changed performance
distribution.

The paired GCP wake, experiment and cleanup jobs all reached
terminal **PASS**. Physical cleanup explicitly printed
`U1_FORMATION_GCP_STOP=TERMINATED`.
[Artifact 12261953351](https://github.com/psvensson/lagrange/actions/runs/39416252319/artifacts/12261953351)
contains all eight unmodified original TAP logs.

## Bounded disposition

- **One independently isolated deterministic regression in the
  old integration fixture's manager interface**, with a one-file
  corrective proposal and clean-source PASS. It is not proof that
  bound WASM service creation is safe without a real journal owner.
- **One REPLACE membership/wake schedule-sensitive failure**,
  still needing owner-level discrimination (no source fix accepted).
- **Two one-node formation/CDC/participant-release failures present
  on the original source too**, requiring a separate causal owner
  investigation; no silent timeout increase.
- The 115 historically red filenames and original 119-file
  GCP failure remain observable release debt. The full
  55-item U1 combined verdict, independent fixture approval,
  currentness native physical proof, U2/activation and `main`
  remain BLOCKED.

No source code was changed or merged to main; the correction
stays isolated, while proof and diagnostics remain on distinct
GitHub branches.
