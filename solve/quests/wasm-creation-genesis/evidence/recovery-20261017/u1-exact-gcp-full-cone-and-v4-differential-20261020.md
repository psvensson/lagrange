# U1 exact GCP change cone / V4 differential — 2026-10-20

**Immutable candidate:** `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
This is an evidence ledger, **NOT** whole-U1 acceptance, certification,
publication or a main-merge authorization. No production/tests changed.

## Full ordinary change cone: terminal GCP outcome

[Actions run 39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693):
- The workflow's **exact candidate** and old base
  `381750de29af647d446b19adedf1da53eb712093` were checked.
  The canonical change selector returned **1,898 files** with SHA256
  `dc20fcd3832012570c8b541b78364e54fc5adf42e420e62aee768ae04132b991`.
  Canonical import-graph preparation and source-tree preservation passed.
- The existing classified runner **executed all 1,898 selected files** in
  21 reported batches (19 hundreds, plus smaller lane/remaining batches).
  Exact batch totals add up to **1,779 PASS, 119 FAIL** and
  **76,425 runner-reported assertions**. This is a genuine exhaustive
  selected-cone **RED**; do not hide it behind earlier 38/38 focused PASS.
- The 119 distinct failing filenames come from 16 top-level test areas:
  integration 26, partition 21, query 18, raft 10,
  rebalancer 9, bootstrap 9, node 6, scripts 6,
  control-plane 4, index-management 2, runtime 2, wasm-service 2,
  address 1, config 1, message-group 1, workflow 1.
- All selected files were visited under the owner runner's keep-going
  policy. A red file can report dozens of canceled nested TAP cases:
  those are not dozens of distinct regressions.
- All raw test reports and TAP results were uploaded as
  [artifact 12256004857](https://github.com/psvensson/lagrange/actions/runs/39393585693/artifacts/12256004857),
  approximately 4.98 MB in the workflow artifact. Every failure remains
  visible. Preserve the first substantive cause per file before any
  repair or inheritance attribution.
- The workflow's **wake** and **VM-stop cleanup** jobs both completed
  successfully. It shut down the existing
  `lagrange-ci-runner` instance that the workflow had started.
  No separately provisioned new GCP distributed cluster was created.

Earlier lab samples and predecessor baselines showed several red files
were already failing at `381750de`, including the three Raft
census/durability/lifecycle files in
[baseline #543](https://github.com/psvensson/lagrange-lab/issues/543)
(0/3 PASS) and six of seven node/partition selected files in
[baseline #551](https://github.com/psvensson/lagrange-lab/issues/551)
(1/7 PASS). These bounded observations are **not** a license to claim
the other 109+ files inherited, and a matching red filename does not
prove the same first cause.

## V4 explicit ordinary HELD wake: decisive source-only pair

[GitHub Actions 39405150063](https://github.com/psvensson/lagrange/actions/runs/39405150063)
executed the unchanged original C6 integration test named
`U1 memo wake: real HELD J retains one wake behind exact F through handler gate release`
via the Node 22 test-name selector, without broad-file
neighboring failures:
- **Positive:** exact test-only witness `537ae826473f8fa8a20e28d783aa5fe76301ffbd`,
  whose production tree is the U1 candidate. The unchanged original
  integration oracle reported **1 PASS, 0 FAIL**.
- **Negative:** direct child
  `83e2a9679f3ec3e59134b8bb37b323a104d48c8c`
  changes only
  `src/node/runtime-service-bound-creation-route.js`:
  suppress `memo.wakePending = true` while exact future
  `F` holds the canonical gate. It reported **1 FAIL** with
  the *intended* direct assertion
  `ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`.
  The negative job was marked successful because it verified the
  expected source-only RED, not because the mutated source passed.
- The new diagnostic wrapper additionally checks exactly one original
  test case actually executed, so all-skipped is not a false green.
  The original C6 fixture and assertions remain unchanged.

**Bounded V4 source-only discriminator: APPROVE** as an
executed positive/negative property witness for retaining the
ordinary HELD J wake during the occupied gate. **Do not infer**
all V4 replacement/generation liveness obligations, real distributed
network progress or independent combined U1 acceptance from that one
oracle. Original wider V4 negative [#480](https://github.com/psvensson/lagrange-lab/issues/480)
had unrelated neighboring failures; the single-case differential
closes precisely its ambiguous effect discriminator.

## Still-open acceptance gates

- Full 1,898-file selected cone is **RED (119 files)**.
  Need independently classify actual inherited vs introduced failures
  with exact same-file and exact first-failure comparisons. Do not
  weaken tests or suppress the entire corpus.
- Independently qualified final source and oracle reviews; full
  55-item combined U1 conclusion.
- Distinct physical generation / cleanup / distributed placement
  certification, later U2/activation/release workflows remain separate.
  A successful read-only
  [GCP topology dry-run](https://github.com/psvensson/lagrange/actions/runs/39404974119)
  enumerated eight existing canonical topology scenarios, but
  **did not create VMs or execute those scenarios**.
- No code was merged to `main` and no mutable candidate head was
  altered by these observation/proof workflows.
