# Exact remaining proof input and execution handoff

Reviewer/planner: `subagent:/root/snapshot_contract_audit`, 2026-10-15. This artifact records read-only planning and the execution inputs handed to the principal. The reviewer did not execute native tests, claim a machine lease, or change repository source/test files.

## Source identity and source review

Candidate is `4aa8780cfec6f2718b86b4d1e27ee9711492be59`; base is `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`. A new read confirmed current HEAD, no tracked differences under `src`, `test`, `scripts`, `package.json` or `package-lock.json`, and runtime SHA256 `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f`. Additional untracked review receipts were visible; no clean-whole-worktree claim is made. This commit contains the exact source previously approved by `source-review.md`, SHA256 `f9c6e0f78e8fcd5af86407af8dd9008967ee3c65695ccbd8874d68e6404e35c3`. Its source approval is bounded to the correction and does not imply candidate test success or terminal landing.

The principal preserved this non-main WIP checkpoint after a normal hook reported two inherited decision-boundary findings. This receipt does not relabel that route as a green normal commit gate.

## Canonical input and exact set equation

`planChangeProof({base, head: sha, planRoot: root})` and `planTestPaths()` from the existing `scripts/select-change-tests.js` produced WIDENED **1,442 unique tests**, including the unchanged unconditional safety spine. The current root's generated import graph and classifier inputs were used, with the committed source/test/scripts tree unchanged. The result agrees with the principal's canonical explanation, `source-proof-selection.txt`, SHA256 `0ce9d353dc66bdd621820641cf3c2a5fca6577bd88b65938e8c25fabb3c31c7e`.

Exactly **11** completed first-execution files were excluded from additional execution. Their four request/summary pairs (`candidate-controls`, `affected-turn`, `affected-ready`, `affected-recovery`) name the same candidate SHA, exit zero, no unrun files, matching exact test hashes, and raw TAP present for every result. The planner verified each test hash against `git show 4aa8780c:<path>`. These are evidence-backed exclusions, not inferred passes. Their complete paths and receipt hashes are embedded in `remaining-proof-plan.json`.

The planner and a separate read-only set check established:

```text
full canonical set                         1442
completed exact-commit first executions      11
remaining requested first executions       1431
group concatenation size                    1431
group unique size                           1431
groups union completed exclusions           1442
missing / extra paths                       0 / 0
```

The canonical selector separately records two `convergence-probe` files as observed by the non-gating canary: `message-group-multi-join-formation.integration.test.js` and `node-join-convergence-slo.integration.test.js`. That is the unchanged selector's classification, not an additional omission by this plan. This execution cannot claim those canary observations.

## Existing ownership of selection, classification and placement

The new `/tmp` planner delegates selection to the canonical selector, lane/class/job limits to `planClassifiedTestFiles()`, cost estimation to `estimateFileCosts()`, and grouping to `placeTestFiles()`. It introduces no repository policy, resource limit or scheduler. All relevant live API files were compared with the candidate commit and their hashes recorded.

The principal explicitly selected `tv-dator`, `adam-laptop` and `adams-gamla` for the remaining tests, leaving Lenovo for the source comparisons. Fresh discovery returned each selected host ready, dependency-compatible and free at the planning observation. The complete discovery is preserved. These observations are not leases; the executor discovers again and acquires each existing machine lock. No held state, fake capability, controller dependency override or discovery result filter is injected.

| Requested host | Files | Estimated load ms | Ordinary jobs/count | Toolchain jobs/count | Bootstrap jobs/count | Exclusive jobs/count |
| --- | ---: | ---: | --- | --- | --- | --- |
| tv-dator | 624 | 718219.108 | 4 / 530 | 1 / 1 | 2 / 69 | 1 / 24 |
| adam-laptop | 455 | 718217.771 | 4 / 381 | 1 / 3 | 2 / 57 | 1 / 14 |
| adams-gamla | 352 | 718217.962 | 4 / 255 | 1 / 1 | 2 / 77 | 1 / 19 |

These are planning costs, not execution results or a liveness bound. The existing estimator reuses last green timings by test path when available, otherwise the lane median, otherwise 10,000 ms. Those observations may come from another fixture/source execution and are not exact-candidate timing proof. Existing placement uses sampled relative host speed, memory/fit/avoid information and core-aware worker limits; the remote classified runner retains its own lane policy and available-core cap. No test timeout or dependency installation was altered to fit the estimate.

## Execution handoff

The wrapper `run-remaining-group.mjs` is external orchestration only. It constructs an exact-commit planning checkout with `labTestCommit`, rechecks every selected test byte, classifies through the existing owner, then calls unchanged `runLabTest({on: host})` with fresh `labTestDeps`. It sets retry to zero and preserves the existing inherited timeout policy. It does not use split discovery substitution, raw SSH, a second lock implementation or local native execution.

Invocation, once for each of the three host names above:

```text
node /tmp/lagrange-runtime-correction-20261015/run-remaining-group.mjs /mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015 /tmp/lagrange-runtime-correction-20261015/remaining-HOST /tmp/lagrange-runtime-correction-20261015/remaining-proof-plan.json HOST
```

The principal reports launching those first executions in sessions 55263 (TV), 19650 (Adam), and 77368 (Adams). This receipt records the launch report, not a completed result. No reruns are authorized or implied by an incomplete/failed result.

Each output directory preserves request, fresh discovery, actual execution plan/costs, streamed run log, remote stdout/stderr outcome, returned per-file result ledger, exit code and summary. The existing runner stream includes reported failures; the returned ledger is not described as full passing TAP for every file. Missing per-file results remain unreported failures, not inferred successes. The eleven earlier full-TAP receipts are retained separately. The wrapper saves/restores any previous controller result relay and must have only one invocation per root/host relay.

## Immutable input artifacts

| Artifact in `/tmp/lagrange-runtime-correction-20261015/` | SHA256 |
| --- | --- |
| `remaining-proof-plan.json` | `76fa57e51dbdab6f4e607567387d1c14c29ff717939901074fd272c1cace8c62` |
| `source-proof-all-files.txt` | `32a48d585f7b7ab537cec158a4b7e3d51fb1099e7897684ed22606d51f81f6bc` |
| `remaining-proof-files.txt` | `217969001428403b3d4c81480a9388b6072caca94ed7bfd88f5a8a91e98021f9` |
| `remaining-plan-discovery.json` | `0e704072cc2505f8860e9622ed1febe7c26ad8352185d14e9dfdf36ef3ca15c7` |
| `prepare-remaining-plan.mjs` | `11918e6f4c9812754b1a516f955588cb434d72282729b8c3dce8a78b26a5b674` |
| `run-remaining-group.mjs` | `50e0e1d416a93dc88f1bd04067231ae3b945326536ee9a6831d24418205d956e` |

The wrapper passed `node --check`; that is syntax validation only. Exact full proof still depends on the 1,431 first executions, the source comparisons, and their honest classification. No full successor/release protocol, activation, sealing or merge approval follows from this planning receipt.
