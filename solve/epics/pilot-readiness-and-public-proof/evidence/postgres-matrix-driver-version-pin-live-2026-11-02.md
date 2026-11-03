---
audience: development
documentClass: evidence
---

# Live measurement after landing: postgres-compatibility-matrix-driver-version-pin (2026-11-02)

The quest `postgres-compatibility-matrix-driver-version-pin` landed as
`a6e1f8a7f` (PR #194). Its terminal log takes no further entries, so its
post-landing measurements are recorded here.

## q10 on a psql 16 host: green

- **Run:** the hosted gate of PR #194, run 41467200945, at head `a6e1f8a7f`.
- **Result:** `test/query/q10-postgres-compatibility-certification-matrix.test.js`
  passed on the hosted runner, whose psql is 16 (16.15 in run 41431327759):
  `ok`, 11 assertions, 3730 ms, at 15:03:01Z.
- **What it measures:** this is the first live run of the new head on a psql 16
  host, the measurement the PR said was still owed. Before the fix the same
  file was red on that runner at the committed-matrix comparison (run
  41431327759).

## The two other red files in that run: not linked to the change

The run failed its ordinary proof on two other files.

### test/integration/leader-metadata-validation.integration.test.js

It was red on the first pass and on the standalone retry.

**The failure is the file-level timeout.** The file declares a fixed
`{timeout: 60000}` (`test/integration/leader-metadata-validation.integration.test.js:226`).
Its CDC readiness budget is scaled by the machine factor
(`timeoutMs = scaleByMachineFactor(3000)`, line 210, 9000 ms on the hosted
runner); the 60 s file cap is not. On the hosted runner, subtests 1 to 3
took about 51.5 s, leaving about 8.5 s for subtest 4, which needs about 10 s:

| Pass | Subtest 1 | Subtest 2 | Subtest 3 | Subtest 4 | File |
| --- | --- | --- | --- | --- | --- |
| first | 18635 ms | 16375 ms | 16529 ms | not ok, 8281 ms | not ok, 60098 ms ("timeout!") |
| retry | 19737 ms | 15301 ms | 15972 ms | not ok, 8773 ms | not ok, 60054 ms |

The "CDC pipeline readiness gate timed out ... timeout=9000ms" line follows
the file timeout. It comes from subtest 4's readiness wait, cancelled when
the file ended.

**Locally, with `LAGRANGE_PLACEMENT=local`, one run at a time on the shared
controller:**

| Commit | Result | Total time | Note |
| --- | --- | --- | --- |
| `6d58fdba1` (base) | green | 56.1 s | 93% of the cap |
| `a6e1f8a7f` (candidate), first run | red | 60.3 s | subtest 1 took 34 s under load |
| `a6e1f8a7f` (candidate), second run | green | 43.2 s | |

**Not candidate-specific.** The change touched only
`src/query/pg/postgres-compatibility-catalog.js`,
`src/query/pg/postgres-compatibility-matrix.js`, their q10 test, the matrix
artifact and its guard. Neither module is imported anywhere in `src/` except
by the other. Main's own hosted gate at `6d58fdba1` (run 41452698217) was
green on this file, which is consistent with the narrow margin above.

**Classification:** a hosted-environment, load-sensitive test bound. The
file-level cap is fixed while the work it covers is scaled. Owner: the
test, `test/integration/leader-metadata-validation.integration.test.js`.
This is the pattern the census `fixed-work-bound-census` records for `src/`,
here in a test. Per the owner rule, no test-bound change is made here.
The main-merge push of PR #194 starts a new gate run, which is the
re-measurement.

### test/raft/raft-rs-backend/single-path-partition-cutover.test.js

Red once, green on retry. This is the same hosted-only flake seen on PR #189's
gate. It is recorded here and was not investigated.
