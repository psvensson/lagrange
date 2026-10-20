# U1 remote lab and GCP execution checkpoint — 2026-10-20

**Subject:** exact immutable U1 candidate
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`. This is an
append-only execution handover; no production/source/test/acceptance
contract change, no merge and no claim of independent U1 APPROVE.

## Controller and authorization actually observed

A fresh [private ping #524](https://github.com/psvensson/lagrange-lab/issues/524)
reported one running controller **v0.2.0**, `paused:false`,
`uncertain_execution:false`, and a standing trusted
`psvensson/lagrange` grant. This is an observation at that time,
not a permanent availability claim. The authorized four worker names
were `tv-dator`, `lenovo-laptop`, `adam-laptop`, `adams-gamla`.
All new source-execution issues named the frozen source SHA, its
unchanged branch tip, existing classified runner, explicit test files,
a finite deadline and only those four worker choices. No direct SSH,
new local service, host enrollment or override of thermal policy.

## Four-host local lab results, extra changed-owner samples

These are **three distinct 32/31/32-file experiments** beyond the
previously positive 15/23 U1 short selections. They do not cover the
entire 1,898-file selector cone. The canonical evidence is each
original issue's final controller receipt, *not* an assertion made here.

| Issue | Test focus | Actual final result |
| --- | --- | --- |
| [#525](https://github.com/psvensson/lagrange-lab/issues/525) | raft-rs admission/membership/commit/lifecycle | **29/32 files PASS, 3 FAIL**, 141 runner-reported assertions |
| [#526](https://github.com/psvensson/lagrange-lab/issues/526) | node activation/recovery/lifecycle | **27/31 files PASS, 4 FAIL**, 1,632 assertions |
| [#527](https://github.com/psvensson/lagrange-lab/issues/527) | partition transactions, split/merge/release | **29/32 files PASS, 3 FAIL**, 991 assertions |

Net observed **85/95 PASS, 10/95 FAIL** across these selected files.
The counts are file executions; high TAP child-cancellation counts
in one file must not be mistaken for 85 independent product failures.

Initial first-failure census:

- #525: `committed-membership-census.test.js` static owner-caller
  census; `durable-commit-replica-kinds.test.js` durability
  expectations; `lifecycle-registry-runtime-generation.test.js`
  source-operation census. Original raw chunks
  [#528](https://github.com/psvensson/lagrange-lab/issues/528) through
  [#531](https://github.com/psvensson/lagrange-lab/issues/531).
- #526: `replica-create-admission-recovery.test.js`,
  `replica-handler-owner-path-bypass.test.js`,
  `replica-handler-cache-state.test.js`, `replica-handler.test.js`.
  The first contains pending-Promise/cancelledByParent observations;
  missing child assertions are NOT proof of any later desired effect.
  Raw evidence is in #534–#537 and #542–#548.
- #527: first observed reds include
  `participant-release-first-prepare-native.test.js` and
  `partition-write-leadership-transfer-committed.test.js`.
  All three failing-file identities must be recovered from the original
  complete receipt/log before any complete finding classification;
  raw evidence requests include #538–#541.

An independently submitted **pre-U1 exact baseline** experiment on
`381750de29af647d446b19adedf1da53eb712093`,
[lab #543](https://github.com/psvensson/lagrange-lab/issues/543),
also returned 0/3 for the three #525 failing Raft test files.
That establishes the **files were already red at the predecessor**.
It does not establish identical first causes or license weakening any
test. A second predecessor comparison for seven node/partition failures
was issued as [#551](https://github.com/psvensson/lagrange-lab/issues/551);
read its terminal result before classifying any additional inherited red.

## GCP, verified without requiring a user-side terminal

- GCP Workload Identity Federation preflight initially refused to
  compare against a shallow checkout. The corrected unchanged WIF
  action/fetch-depth workflow then completed
  [Actions #39392826352](https://github.com/psvensson/lagrange/actions/runs/39392826352)
  **PASS**. Existing project `something-2e584` and stopped
  `lagrange-ci-runner` in `europe-north1-a` were observed.
  No service-account key or credential content was copied into Git.
- A bounded exact-source
  [GCP runner smoke #39393155000](https://github.com/psvensson/lagrange/actions/runs/39393155000)
  completed **PASS**, 3/3 files and 93 runner assertions; dedicated
  wake/source/cleanup jobs returned PASS. The cleanup explicitly
  stopped the VM it started and verified `TERMINATED`.
- A separate exact-source
  [full selected-cone run #39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
  is **submitted**. Its code pins `be25caa5`, derives the original
  source's change selection against `381750de`, demands the
  observed 1,898-file list and SHA256
  `dc20fcd3832012570c8b541b78364e54fc5adf42e420e62aee768ae04132b991`,
  runs the original classified change-proof owner on the already
  commissioned GCP self-hosted runner, uploads test evidence
  even on red and attempts a stop/verify in an `always()` cleanup job.
  **Submission, runner admission and a currently running job are not
  terminal test evidence**. This document does not claim its
  result or teardown is already known. Read the original Actions run.
  Its native selected-cone limit is 180 minutes, not an infinite worker.

The GCP verification workflow remains on
`verify/u1-gcp-20261020`, with no changes to `main` and no
automatic distributed Pulumi VM provisioning. Real three/five-machine
Raft failure certification is still a **separate** later boundary;
do not provision another cloud fleet before reconciling the
deterministic red inventory, especially since the existing Pulumi
harness's local ephemeral state/partial teardown can leave billable
resources after an abrupt controller loss.

## Gate disposition

**OPEN**: full selected-cone terminal result, exact first failures and
inherited-vs-introduced classification; remaining meaningful V4
wake/progress discriminator; independent final source/oracle approvals;
55-item combined U1 checklist; physical multi-machine acceptance; U2
and activation dependencies; publication and main merge.

**No U1 approval or main merge has been performed.** Diagnose the
original owners, preserve the old negative controls, correct one
mechanism at a time, and refreeze/re-run static and all affected tests
for any future changed candidate.
