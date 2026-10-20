# U1 exact selected change-cone census — 2026-10-20

**Subject:** `be25caa5f0c3612feec662d4feaa9ba28f8f34df`
(tree `3ee5dafe4e862d101acf0def7766c78fc97655b2`),
against the original required base
`381750de29af647d446b19adedf1da53eb712093`.

The repository's **unchanged** `scripts/select-change-tests.js` owner
ran in an isolated detached checkout. Its original generated import-graph
producer first materialized the ignored local graph, as required by the
real selector; no proof-scope/test execution was invoked.

- [Lab #521](https://github.com/psvensson/lagrange-lab/issues/521):
  the ordinary selector `--list` and `--explain` both succeeded,
  1/1 diagnostic PASS. This is a read-only **selection** claim.
- [Lab #522](https://github.com/psvensson/lagrange-lab/issues/522):
  repeat runs the same exact selector successfully but intentionally
  emits a TAP failure to retain a bounded, machine-readable selection
  receipt (normal passing TAP filters hide diagnostic stdout). Original
  [evidence #523](https://github.com/psvensson/lagrange-lab/issues/523)
  contains the receipt. The diagnostic fail is **not** a Lagrange code
  or selector failure: both `explainCode` and `listCode` were 0.
- Selector returned **1,898 unique selected test paths**, listing
  fingerprint SHA256
  `dc20fcd3832012570c8b541b78364e54fc5adf42e420e62aee768ae04132b991`.
  This exact count is authoritative over earlier approximate 1,896.
  38 named focused/compatibility files were run and passed on precisely
  this SHA by [#514](https://github.com/psvensson/lagrange-lab/issues/514)
  and [#515](https://github.com/psvensson/lagrange-lab/issues/515).
  **1,898 selected is NOT 1,898 executed.**
- Current result therefore **does not** satisfy the full ordinary
  changed-owner test execution gate. Do not replace the 1,898-file
  cone by the 38-file short selection, a fictitious corpus pass or
  the static checks. The correct next execution plan must partition
  exactly the selector's immutable paths under the ordinary classified
  lab harness, preserve resource/thermal/owner bounds and aggregate
  genuine terminal receipts without hidden skipped files.

All other U1 limits still apply: independently qualified final source
and oracle approvals, meaningful V4 wake/progress discrimination,
the 55-item U1 review and separate U2/activation/main release gates.
The candidate remains frozen and unmerged.
