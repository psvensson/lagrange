# Runtime captured inbound extent: affected proof and execution plan

Planning-only independent audit, 2026-10-15. No native tests, lab locks, source edits, commits or publications were performed. This file is review evidence; it is not an execution receipt.

Worktree inspected: `/mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015`. Current inspected HEAD: `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`; branch `review/runtime-captured-inbound-correction-20261015`. Root-owned test/Quest changes were staged and generated inventory refresh was in progress. This state is not an exact committed candidate and no host observation is treated as a lease.

## Nine required owner files

All paths below exist beneath `test/raft/raft-rs-backend/`. Current classification is storage-raft and resource ordinary for all nine; the two integration files are promoted to the existing effective exclusive lane, jobs=1, by `scripts/run-classified-test-files.js:206`.

| Group | File | Primary class | SHA256 |
| --- | --- | --- | --- |
| Turn/wake/lifecycle | runtime-turn-integrity.test.js | unit | 398eca66728c0e50c240af08287fe76548692e7566768e534ff3a1011978304b |
| Turn/wake/lifecycle | inbound-drain-owned-timer.test.js | unit | 82e2704c3562d90cff3ffbc2fd39970078312302ffcb62529cbd14d3afaf7fa3 |
| Turn/wake/lifecycle | lifecycle-registry-runtime-generation.test.js | unit | 63bd77c7d3b92c7965ad95285d83b791028c5ffe3fb44d95c6769cbaead88121 |
| Ready/persistence | operation-port-ready-recovery.test.js | unit | edd3a9d1d5a1c24a4383c0ecd089babedea65715658668c95313966730f2a22f |
| Ready/persistence | persistence-admission.test.js | unit | a9d05c8d8069ecf58e95a0d1eac01d125753a524977d2a1cb282cdc71da35534 |
| Ready/persistence | durable-ready-loop.test.js | unit | e90174335f51252bcf72f2f70f27e7ffd19b81385feaf1e5dc571582d3dbe345 |
| Reconstruction | runtime-trap-and-restore.test.js | unit | 802bd4c2201c2712daeb6ac191962cb2fc084f7de925968fef2a071dbeb7d7bd |
| Reconstruction | runtime-replacement-review.integration.test.js | integration | e741ad627b50333537913e089dc36213bd6cc847299113a1dfc9c9991c5659ec |
| Reconstruction | runtime-load-recovery.integration.test.js | integration | f5d39f0cc01ae49ff2c8d12771763bda913441878b6d578bc7bed4c245f7917f |

The first group preserves CA1/M9, CA5, accepted-work timer custody and exact lifecycle identity. The second preserves Ready ordering, shared-connection admission and application/progress atomicity. The third preserves group/shared failure scope, actual reload/reconstruction and failure backoff. These three groups can run concurrently on distinct freshly discovered, independently locked hosts. Their native RF3 fixtures are multiple replicas within one host; this is not physical cross-host cluster certification.

Frozen W07 and the new boundary file are additional controls, not substitutions for the nine:

- `test/raft/raft-rs-backend/runtime-captured-inbound-service-native.test.js`: preserve Git blob `debc16f442ba63b100332d93b285865d36d1c376` and SHA256 `07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d`.
- `test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js`.
- The boundary file imports `test/raft/raft-rs-backend/runtime-captured-inbound-companion-fixture.js`; its final exact bytes must be frozen before the baseline/candidate/mutation runs.

## Current canonical selection owner

The current npm/lab selector is `scripts/select-change-tests.js`, backed by `scripts/checks/change-selection.js`. `scripts/lab/probe.js:2515–2527` constructs `scripts/select-change-tests.js --list --head SHA --base BASE`.

Do not substitute the older `scripts/select-proof-cone.js`: its separate full-suite escalation rules are not the current npm/lab change-selection policy. The current selector widens production changes to whole owning subsystems and registered interaction witnesses; helper import closure adds tests and cannot narrow them. The orchestrator unconditionally adds the safety spine.

A read-only preview used the exported `buildExecutionPlan` with these four explicit paths:

```text
src/raft/raft-rs-runtime-owner.js
test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js
test/raft/raft-rs-backend/runtime-captured-inbound-companion-fixture.js
test/shards/impact-contracts.json
```

It returned `REFUSED`: `SAFE TEST SCOPE UNKNOWN: changed test file has no subsystem classification: test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js`. The 32 spine tests in that refused plan are not a runnable substitute. This is the then-current metadata state, not a permanent selector defect or a test result. Do not bypass it. The root's normal test-commit metadata refresh should be followed by a fresh selection against the exact committed source candidate.

Before refusal, registered interactions resolved these subsystems: storage-raft, storage-partition, transport-messaging, wasm-toolchain, bootstrap-membership, placement-rebalance, query-sql, test-infrastructure. No final count is claimed while metadata/source are pending. The nine named files do not define the entire canonical cone.

After source commit, from a clean checkout of that exact source SHA, derive and preserve:

```sh
node scripts/select-change-tests.js --base a7e821154f1039df82bfc73ef4f2e25e4fa0468d --head SOURCE_SHA --explain
node scripts/select-change-tests.js --base a7e821154f1039df82bfc73ef4f2e25e4fa0468d --head SOURCE_SHA --list
```

`--explain` and `--list` do not execute tests. Preserve stdout, stderr, exit, command, source SHA and selector inputs. The selector includes visible working-tree changes even when `--head` names a commit (`planChangeProof` and changed-record ownership); a clean exact-source checkout avoids an uncommitted helper or production edit contaminating the claimed cone. Include generated metadata in the actual commit-range selection rather than assuming the four-path preview is the final change list.

For a machine-readable plan without execution, import `planChangeProof`, `planTestPaths` from `scripts/select-change-tests.js` and `planClassifiedTestFiles` from `scripts/run-classified-test-files.js`. Call `planChangeProof({base, head, planRoot})`, refuse null/REFUSED, and pass its exact deduplicated `planTestPaths(plan)` to `planClassifiedTestFiles`. This is the repository owner API, not a new selector. Preserve the plan JSON and source hashes. Do not call `writeProofScope` for a planning pass.

## Locked execution once authorized to run

The existing full-cone lab CLI is:

```sh
LAGRANGE_RETRY_FAILED_ONCE=0 node scripts/lab.js test changed --lane all --sha SOURCE_SHA --base-sha a7e821154f1039df82bfc73ef4f2e25e4fa0468d --split
```

This uses current discovery, existing lane/resource rules, machine-wide locks, isolated exact-commit placement and dependency readiness. `--split` requires `--lane all` and cannot be combined with `--on`. Do not set TAP_TIMEOUT or alter machine factors; retain the executor's actual environment in evidence. The split controller is a reserve under the existing owner policy, not an assumed extra lab machine.

For the nine explicit causal controls or one-file raw-TAP captures, use the already exercised exported API: `labTestCommit({root,sha})`, `planClassifiedTestFiles(commit.gitRoot, files, lastResultsRoots(root))`, `estimateFileCosts`, `labTestDeps({root})`, and `runLabTest({plan,costs,commit,on:host,root,env:{...process.env,LAGRANGE_RETRY_FAILED_ONCE:'0'},results,write},deps)`. The CLI does not accept a hand file list or `--tests`; do not invent such a flag. Let the existing API enforce locks and placement. `commit.release()` is idempotent; retain cleanup even on failure.

The previous exact one-file raw-TAP relay is `/tmp/lagrange-native-runtime-service-20261015.3juv0xul/run-one-capture.mjs`, which calls those existing APIs and asks their `results` relay for `.tap/test-results/TEST_PATH.tap` before remote checkout removal. It is an orchestration example, not a new production harness. A multi-file run's default results relay contains per-file verdict records, not every passing raw TAP. If complete native diagnostics are required, run each explicit native file once through the existing one-file capture route, sequentially within each group and in parallel across distinct hosts. Preserve that file's first failure before any revision or follow-up run.

At most one controlling invocation per host should write its `test-results-HOST.ndjson` relay at once. The existing lock protects remote execution; independent local wrappers must also avoid racing backup/restore of that relay. Preserve complete results before another run reuses it. A canonical cone can be divided only as disjoint subsets of its exact owner-produced plan with an explicit union/coverage record; do not claim a manually narrowed focus group is the canonical proof. Alternatively run the CLI's complete split plan and record any necessary focused-control overlap honestly.

Candidate, source-only predecessor and capture-mutant comparisons belong on the same fresh host/dependency identity with identical final test/helper bytes. Do not retry until green. Retain declared mutations, source fingerprints and first semantic failures separately from positive certification. An import/setup/timeout failure is a seam failure, not the intended RED. No new dependency install, repair of a shared host installation, raw SSH runner or lock bypass is part of this plan.

Fresh discovery must validate the exact candidate dependency graph, Node/toolchain/native availability and current lock state. Existing fleet names and old reservation records are placement candidates only. If a host is held/unready, use the existing lock wait or a ready eligible host; do not evict another owner. Record discovery, placement plan, holder/lock provenance, source and test hashes, command/environment, raw output, exit, per-file result and cleanup.

## Review-only source checkpoint

Normal `git commit` is available in this isolated non-main worktree. `.githooks/pre-commit` runs staged-file checks and regenerates inventories/test metadata; it is distinct from terminal `solve land`. `docs/development/quest-subagents.md:51–53` still requires independent content-bound verification before source checkpoint/handoff. The current design review is not that future source review. Record the new source attempt and independent reviewer verdict against its exact content.

Do not run `solve land`, mark this Quest terminal, activate/seal the complete release successor, merge or publish main. `docs/development/solver-runbook.md:143–147` and `.githooks/pre-push:189–199` distinguish non-main preservation from those actions.

If an ordinary source commit fails solely on the unchanged inherited decision-boundary findings, the runbook at lines 167–169 explicitly permits `LAGRANGE_SKIP_PRECOMMIT=1` for a work-in-progress branch, never shared landing. The user's no-unrelated-extraction constraint makes that a permissible preservation route only with the normal hook failure and unchanged before/after findings retained, current generated metadata prepared through its actual producers, independent exact-source review recorded, and an explicit WIP/red-check qualification. Do not label skipped checks green or a gate satisfied, and never set `LAGRANGE_SOLVER_LANDING=1` to masquerade as an already-proven landing. Prefer the normal commit when its checks pass. This audit performed neither route.

## Inspected owner fingerprints

```text
dc05317d3d03d2e3d3cb391d17d300c8a2d815d31a270759756696730adce329  .githooks/pre-commit
f2c117556241418994e3f3ea8b4e7b2b7c8da721c9f2ad20099f9d969b0599a0  scripts/select-change-tests.js
bcfb7c27c2b94114a045f4c5cb45fecb54cc92972a5079ba908c1ab9d963bb1b  scripts/checks/change-selection.js
493381e074c12987446a27f4feb7a0385f6afea46e97fa41f4c826464f7e8b70  scripts/lab/probe.js
574b5d8b9376e4b338e02ca1215a48cc0487bdc7dae6934cd8c545dea5c8b9e6  scripts/lab/lagrange-lab.js
cbbfcb9494a76069b33457b87e2cebf1d0e6e7a69c0b2d08181ab89736791aea  scripts/run-classified-test-files.js
```

No candidate source is approved by this plan. No snapshot, release command, TX semantics, capacity contract or full-protocol certification is reopened.

## Subsequent test-checkpoint and orchestration addendum

The root completed the test-only checkpoint `04391697aeabea5ddd504491321546212b95982e`. Read the resulting canonical explanation at `/tmp/lagrange-runtime-correction-20261015/test-checkpoint-proof-selection.txt`, SHA256 `7c06959641fced3313446c7c590b5d707126ac848df4b47cedc1a954c1b94af1`: WIDENED, 193 unique tests, 32 unconditional spine, test-infrastructure subsystem. This resolves the earlier in-flight metadata refusal for that test-only checkpoint. It is not the future source-change cone and does not replace its derivation.

Prepared `/tmp/lagrange-runtime-correction-20261015/run-group-capture.mjs`, SHA256 `b960e23e0648029e06fb114e033ae65a25ab465cf8cb901fb7f4d0c89cff6a5c`. Usage: `node run-group-capture.mjs ROOT NEW_EVIDENCE_DIR FULL_SHA HOST TEST_FILE...`. It executes each requested file once through existing `labTestCommit`/classification/locked `runLabTest`, refreshes discovery for each file, pins the API and test bytes to the requested full SHA, fixes retry=0, preserves raw TAP and per-file results, records unrun files after infrastructure refusal, and backs up/restores the controller relay. Run different groups on different hosts; never two controller invocations against the same ROOT/HOST relay concurrently. Native failures do not cause retries; the remaining independent files still run. It does not alter timeout policy or dependency installations. `node --check` passed; no native/execution run of this wrapper occurred in this planning task.
