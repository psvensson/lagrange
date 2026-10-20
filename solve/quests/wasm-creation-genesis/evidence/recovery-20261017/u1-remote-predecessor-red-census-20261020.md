# U1 predecessor-source red census — 2026-10-20 addendum

Both predecessor experiments below use immutable
`381750de29af647d446b19adedf1da53eb712093`;
no U1 candidate tests or production changes were applied.
They are executed *historical baselines*, not the final candidate.

| Exact predecessor experiment | Executed result | Narrow significance |
| --- | --- | --- |
| [Lab #543](https://github.com/psvensson/lagrange-lab/issues/543): three failing raft-rs files from U1 sample #525 | **0/3 files PASS, 3 FAIL; 17 runner-reported cases** | The same three file names were already red at the pre-U1 source baseline; do not automatically attribute every failed census/durability condition to U1. |
| [Lab #551](https://github.com/psvensson/lagrange-lab/issues/551): seven node/partition files selected from candidate runs #526/#527 | **1/7 files PASS, 6 FAIL; 145 cases** | Most of these files were also red before U1. Differences in individual failed assertions and fixture/source semantics must still be compared before classifying any candidate red as `INHERITED` rather than `REGRESSION`. |

The positive exact candidate is still
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
The four-host candidate sampling result is **85/95 file PASS** across
[#525](https://github.com/psvensson/lagrange-lab/issues/525),
[#526](https://github.com/psvensson/lagrange-lab/issues/526) and
[#527](https://github.com/psvensson/lagrange-lab/issues/527),
**not** a green selected change cone.

The original whole selected cone has **1,898** paths. Its GCP
GitHub Actions run
[#39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
was launched at exact candidate via the pre-existing GCP
self-hosted CI VM; obtain a terminal workflow result and confirmed
VM stop before promoting any claims. No source change, main merge,
U2, or release approval is inferred from these baseline reads.
