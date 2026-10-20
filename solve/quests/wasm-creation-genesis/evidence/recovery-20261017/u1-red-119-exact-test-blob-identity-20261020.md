# U1 GCP 119 RED: exact test-file content ancestry (2026-10-20)

**Read-only first-order source witness.** The failed corpus was at
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`; the
required sealed comparison baseline is
`381750de29af647d446b19adedf1da53eb712093`.

[The source-only GitHub workflow #39408022963](https://github.com/psvensson/lagrange/actions/runs/39408022963)
read all **119 exact failed-file paths** from the candidate's
[canonical RED filename list](https://github.com/psvensson/lagrange/blob/48fef5ed45c5d2a36ac0cf02d0f6ad02860a558e/verification/u1-20261020/gcp-corpus-119-red-files.txt)
and measured their Git blob identities at **both immutable commits**:

| Byte classification | File count |
| --- | ---: |
| Same exact test-file blob at old and candidate | **119** |
| Different test-file blobs | **0** |
| Absent test file at old | **0** |
| **Total** | **119** |

The workflow completed **PASS**, uploaded
[artifact 12257962850](https://github.com/psvensson/lagrange/actions/runs/39408022963/artifacts/12257962850)
with path-level identities and SHA256
`daab49f764737378753f462f29a373521741eac3a01b6e1094756ba5f8d5ad0e`
for its JSON manifest. No subject/test files were edited during this
measurement.

**Interpretation:** none of the 119 failed test files changed their
*own bytes* since the pre-U1 baseline. Thus a changed test's rewritten
assertion text, or a newly added test file, cannot explain these
specific failed filenames. This does **not** establish they were all
red before U1: imported fixtures/production dependencies may have
changed, the first failing assertion may have changed, and timing
can expose latent defects. The raw [candidate exhaustive run
#39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
remains 1,779/1,898 PASS, 119 FAIL, with 76,425 reported
assertions; the GCP runner was stopped/verified after this run.

A separate [predecessor execution #39405963549](https://github.com/psvensson/lagrange/actions/runs/39405963549)
was launched to run precisely those 119 unchanged tests against
the original source. Its **terminal counts and per-file first causes
must be read before any inherited/regression classification**.
Do not classify all 119 as inherited based on blob identity alone.

Current first-order U1 state: focused 38/38 green; full 1,898
red; V4 ordinary HELD wake red-on-revert independently demonstrated
by exact source-only pair [#39405150063](https://github.com/psvensson/lagrange/actions/runs/39405150063).
U1 combined independent verdict, full release, native multi-host
witness, U2/activation and `main` merge remain blocked.
