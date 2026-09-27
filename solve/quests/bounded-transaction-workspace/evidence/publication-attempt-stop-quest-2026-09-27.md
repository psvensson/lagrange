# Publication attempt: completed transaction STOP quest

Date: 2026-09-27

Local ref: `refs/heads/quest/distributed-transaction-replicated-apply`

Required immutable head: `292b7204334cf47617e675dd9b12bc708b682886`

Remote: `origin`

## Preconditions

- The dedicated worktree was clean.
- `HEAD` and the local branch ref both resolved to the required SHA.
- `git ls-remote` found no existing remote branch.
- The quest-only range `33885263f..292b720433` contained no `src/` changes.
- The push used an explicit local and remote branch ref, without force or
  history rewriting.

## Gate result

The repository materialized the exact pushed SHA in an immutable checkout.
Unused-file, lint, duplication, file-size, circular-dependency,
unused-export, cleanliness and thermal stages passed. Because the destination
branch was new, the test stage exercised the whole corpus through the lab
placement owner.

The decisive persistent failure was:

- host: `tv-dator`;
- test: `test/integration/transaction-concurrent-read-outage.integration.test.js`;
- initial run: failed during application-DDL/write readiness after formation;
- mandatory standalone retry: failed in the same formation phase;
- symptoms included no leader for the harness write probe, terminal operation
  collisions and storage-reservation conflicts;
- each attempt consumed approximately 240 seconds.

A Lenovo membership-consistency failure passed its standalone retry. A
Windows formation-simulation process timeout also passed its retry and the
remaining Windows exclusive lane was green. Those recovered findings were not
the final refusal.

The exact-checkout gate ended with `project-hardening-proof-postpush: FAIL`,
named `change-proof` as its first failed proof, and stated that nothing was
pushed.

## Publication state

`refs/heads/quest/distributed-transaction-replicated-apply` has no remote ref.
There is no exact-HEAD whole-corpus receipt for `292b720433`, so the documented
test-stage-skip precondition is not met. No force, `--no-verify`, GitHub API
ref creation or unreceipted `LAGRANGE_PUSH_SKIP_TESTS` retry was used.

The design STOP remains finished and its local evidence head remains clean and
immutable. Publication is separately unresolved; it must not be represented
as pushed or green.
