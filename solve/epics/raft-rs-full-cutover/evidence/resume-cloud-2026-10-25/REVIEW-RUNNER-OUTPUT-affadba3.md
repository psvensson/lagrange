# Independent review: shared runner TAP output repair

**Verdict: REJECT Package 2 completion at `affadba3af02932b36c06242daa87d333a9cfe5d`; one material inherited contract gap remains.** The explicit TAP reporter correctly repairs the measured default-format failure. It does not yet establish the promised output format for the supported nested-runner entry path. The only blocking finding is **F-RUNNER-CTX-1**, below. No candidate-specific JSON-child, assertion-suppression, or plugin regression was established.

Reviewer: `subagent:/root/metric_review`, independent of the implementation. Date: 2026-10-25. Review and probe artifacts are outside the author worktree. No source edits, commits, composition, push, broad corpus execution, timeout or threshold changes were made by this reviewer.

## Exact applicability

| Identity | Value |
| --- | --- |
| Base local commit | `f30060e714d080ba438f5657b8d15f4bb992b107` |
| Base tree | `5659709d5010bdfa26a3dc545ef948772d8daa51` |
| Candidate local commit | `affadba3af02932b36c06242daa87d333a9cfe5d` |
| Candidate remote commit | `57cef6e93129a878be105076ff8dd85155a8aac4` |
| Candidate local and independently fetched remote tree | `da881d26b995eaedda249987a086d07e116969ac` |
| Base `scripts/run-test-files.js` SHA-256 | `b00cb60ce9de2e1842715e22d4c809cfd30c1593e2094b6361030c3ef81fc374` |
| Candidate `scripts/run-test-files.js` SHA-256 | `f6818fce2c429abe254db5222b45628bef20997e20ec59b280e8d52ba1a0570f` |
| Independently executed Node | `v24.22.1`, Linux, current workspace runtime |

`review-source-binding.json` binds 23 relevant source/contract/history files to committed candidate bytes, six copied fixtures to their unchanged repository bytes, and four root-produced logs. Candidate worktree was clean after review. Remote tree identity was read from GitHub's Git commit API, not inferred from a branch name. Git ancestry here is shallow; historical conclusions below use the preserved repository records rather than a complete ancestry search.

The executable delta is exactly one argument, `--test-reporter=tap`, in the shared `TEST_NODE_ARGS` array, with three explanatory comment lines. Both `runTestFileSync` and `runTestFile` consume that same vector. The change adds no `--test` execution mode, framework detector, second parser, retry, output heuristic, or fallback. The module-loader import, source-map flag, compilation-cache flag, and heap limit remain unchanged. Generated inventory/seal changes and surrounding preservation documentation are not a new runtime implementation.

## Blocking finding: F-RUNNER-CTX-1

**Severity: medium / P2; blocks completion of the shared standalone-child output contract. Inherited defect, not a regression introduced by the reporter argument.**

**Owner and failed invariant.** `prepareTestRun` in `scripts/run-test-files.js` constructs the independently launched test process's environment and output descriptors for both execution methods. Its environment merge forwards `NODE_TEST_CONTEXT`. When a real Node test process calls the runner, Node's inherited `child-v8` value makes the grandchild emit the parent test runner's binary serialization format despite the newly supplied TAP reporter argument. The canonical TAP parser then counts zero assertions and fails an actually passing fixture. This violates the candidate's claim that its one owner pins the format for every test process and prevents useful supported nested execution. It does not create a demonstrated false green: the measured cases fail closed.

**Measured reachable path.** `review-real-parent.test.mjs` runs under actual `node --test --test-reporter=tap`. The parent itself receives `NODE_TEST_CONTEXT=child-v8`; the probe does not manufacture that value. It invokes the exact base or candidate `scripts/run-test-files.js` CLI with `--jobs=1` and the unchanged `node-test-pass.fixture.mjs`. All CLI launches completed without a spawn error. A paired control deletes only that one environment key before the same invocation.

| Canonical CLI source | Parent context forwarded | Actual child representation | Canonical result |
| --- | --- | --- | --- |
| Base | `child-v8` | Binary Node event stream | Exit 1; zero assertions |
| Base | Key removed for control | Human-readable spec output | Exit 1; zero assertions |
| Candidate | `child-v8` | Binary Node event stream | Exit 1; zero assertions |
| Candidate | Key removed for control | TAP | Exit 0; one assertion |

The four-case discriminator passed. The original binary `.tap` bytes, CLI stdout/stderr, per-case ledger, fixture bytes, source hashes, actual parent context, and launch arguments are retained under `real-parent-context/`; `real-parent-context-driver.tap` records the completed outer test. `focused-matrix/results.json` also independently records the exact base/candidate async APIs failing closed when supplied the same binary context.

**Why this is supported and material.** This cannot be dismissed as an arbitrary hostile environment. `test/scripts/run-test-files.test.js` imports `node:test` and calls the exported `runTestFiles` through `runFixtures` without context cleanup. `test/scripts/test-timeout-declarations.test.js` is another real Node-test parent that launches the canonical CLI, cleaning only the timeout variables it owns. The runbook explicitly describes a runner nested in a test when explaining thermal admission. Neither runner CLI/API nor those callers prohibit nesting. The classified runner, proof wrappers, and direct execution callers generally preserve ambient environment. The shared runner therefore owns the relevant child environment boundary; callers do not grant it Node's private parent serialization channel.

**Prior occurrences and first cause.** `scripts/quest-evidence/harness-runtime.js` already documents this exact binary-reporter hazard and its separate subtest path deletes `NODE_TEST_CONTEXT` before explicitly requesting TAP. The replicated-decision receipt path and several runner-facing tests have their own cleanup. The current shared preparation owner has no corresponding normalization. This recurring boundary failure is narrower and more concrete than a general environment-hardening proposal. `scripts/checks/git-process-environment.js` owns inherited Git repository pointers; placing Node-test semantics there would give an unrelated helper a second responsibility.

**Required next action and proof.** Root/author should complete the existing standalone-child environment contract in `prepareTestRun`, keeping the explicit TAP reporter and the one parser/launch path. Preserve the parent's own environment; normalize the copied child environment at its owner rather than add another caller workaround. Re-review should prove actual inherited-context nesting and both sync/async entry methods now count the passing Node fixture, while skip, TODO, real assertion failure, empty output, spec-only output, and nonzero exit remain refused. Existing unrelated TAP/timeout/Git environment behavior must remain intact. No permission, fallback parser, additional deadline, or acceptance weakening is required by this finding.

## Evidence that remains valid for the reporter argument

The ordinary-parent measurements support the reporter correction itself:

| Controlled check | Result |
| --- | --- |
| Same real Node passing fixture, async and sync | Base: process exits 0 but runner refuses zero assertions. Candidate: one counted assertion and success. |
| Unchanged TAP passing fixture, async and sync | Both versions pass with three assertions, including mock-plugin availability. |
| Separate TAP and Node files in one candidate batch | Two files pass; four counted assertions. |
| TAP skip and Node skip, both execution methods | Refused; one skipped assertion observed. |
| Genuine Node assertion failure, both methods | Refused with nonzero process status and failed TAP analysis. |
| Empty and spec-only output, both methods | Refused for zero assertions. Human-readable counters are not accepted as TAP proof. |
| Valid TAP followed by exit 7, both methods | Refused for process exit 7 despite a valid assertion. |
| Node TODO, both methods | Refused with the TODO count retained. |
| TAP using only `node:test` mock utilities | Both versions pass; this matches the direct mixed-import shape found in six repository files. |
| Actual source-mapped Node failure | Both versions retain the original `review-original.ts:41:1` location and fail the test. |

These use the real runner, real Node process, actual installed TAP parser/plugin, and real artifact descriptors. Six original fixtures were copied byte-for-byte only to keep all review output outside the author's checkout. No Node process or parser was replaced with a stub, and no timers were compressed.

The complete extra matrix intentionally remains **red as executed**: 32 of its 34 discriminator checks met their expectations; two extra real ESM `t.mockImport` probes did not complete, one on each source version. Their owned children were interrupted and the interruption records/raw output remain retained. They are not counted as passing plugin execution, nor as a candidate regression. The unchanged plugin import configuration and existing plugin-surface assertions are verified; completion of this additional actual-mocking operation is outside the proved ceiling. The reviewer did not run the runner suite's 520+ MiB stress cases. The root-produced three-file suite result is recorded separately below.

The parser's incomplete-stream, dropped-byte, zero-assertion, skip, TODO, and process-status refusal conditions are unchanged. Source review confirms the reporter argument does not bypass these checks. The historical `runner-output-bound` Quest records repeated rejection of whole-file/whole-line/parser-buffer assumptions and of truncation that hid a skip; its accepted contract is to retain the full verdict or fail the file when analysis is incomplete. This repair preserves that contract. The historical receipt also uses an explicit TAP reporter on Node 22.23.2; that is past evidence, not a current rerun.

## Node compatibility and primary-source comparison

`package.json` declares Node `>=22.12.0`. The official [Node 22.12 CLI documentation](https://nodejs.org/download/release/v22.12.0/docs/api/cli.html#--test-reporter) documents the reporter argument, introduced before the minimum supported version. Node's [test-reporter documentation](https://nodejs.org/api/test.html#test-reporters) records the non-TTY default changing from TAP to spec in version 23. That change falls inside this repository's declared support range and explains the measured predecessor behavior. Explicit format selection is therefore the appropriate producer-side repair.

The same minimum-version [environment documentation](https://nodejs.org/download/release/v22.12.0/docs/api/cli.html#node_test_contextvalue) makes reporter behavior context-sensitive and gives no stable format guarantee for values other than its documented `child` case. The actual Node 24 parent supplies `child-v8`. The existing receipt owner and the current real-parent measurement agree on the boundary problem; a CLI flag alone cannot establish the intended wire format while that private context is inherited. Only Node 24.22.1 was executed in this review. Documentation establishes flag availability at the minimum; it is not a claim that all supported or future versions were runtime-certified.

## JSON-child diagnosis and separate suite results

Root initially observed empty stdout from metric tests' successful-looking JSON child processes. The independent minimal `tap-json-child.fixture.mjs` directly captured the subprocess error, status, stdout and selected runtime context on both source versions. Under the subprocess sandbox, **both base and candidate** returned status 0 with empty output **and an `EPERM` spawn error**. Under an approved ordinary process invocation outside that sandbox, both passed all three checks and returned the exact JSON. Raw first-failure output remains in `json-child/` and successful comparisons in `escalated-json-child/`.

This rules out the reporter argument as the cause at the measured minimal seam. It does not retroactively supply a missing child error field for every original metric test. Root subsequently measured the actual seven-file suite outside that sandbox. I independently read and hashed its logs; these remain root-produced runs, not independent reruns:

| Root-produced evidence | Recorded result and limit |
| --- | --- |
| `rs-raft-runner-format-20261025.log` | Three files / 74 assertions pass, ordinary jobs=4. |
| `rs-raft-package2-seven-files-20261025.log` | Initial sandbox run: four pass, three fail, 180 reported assertions; includes empty-child symptoms and the timeout. Preserved, not green. |
| `rs-raft-package2-seven-files-escalated-20261025.log` | Ordinary process, unchanged default jobs=4/no floor: six pass, one timeout, 197 reported assertions. Metric provenance completes 30 substantive assertions before its TAP cap fails the file. |
| `rs-raft-package2-seven-files-ci-floor-20261025.log` | Existing CI profile, `TAP_TIMEOUT_FLOOR=120 LAGRANGE_LANE_JOBS_CAP=1`: seven files / 196 assertions pass. This is a distinct configured run, not proof that the no-floor run passed. |

Byte-identical copies and original paths/hashes are in `root-produced-evidence/` and `root-produced-evidence-binding.json`. The default timeout is a retained host-capacity/test-cost finding, not permission for this repair to change a timeout or narrow a witness. None of these local tooling runs establishes lab metric acceptance, native service acceptance, full corpus qualification, fresh-seed acceptance, publication, or exact-main proof.

## Review disposition and reproducibility

All material findings in this bounded review are grouped above: one proven completion blocker at the shared environment boundary, with the default-timeout and extra mock-import evidence ceilings explicitly retained. There is no second confirmed candidate-source defect. The first sandbox failure and both interrupted extra probes remain available rather than being overwritten by later success.

Key exact reviewer commands were:

```sh
node /workspace/scratch/285a938494ce/runner-output-review-evidence/review-json-child.mjs
node /workspace/scratch/285a938494ce/runner-output-review-evidence/review-json-child-escalated.mjs
node /workspace/scratch/285a938494ce/runner-output-review-evidence/review-focused-matrix.mjs
node --test --test-reporter=tap /workspace/scratch/285a938494ce/runner-output-review-evidence/review-real-parent.test.mjs
```

The second, third, and fourth commands used the approved ordinary subprocess context; the first intentionally retains the initial restricted-execution observation. The matrix's two manual interruptions and resulting nonzero exit are explicitly recorded. All relevant raw outputs, drivers, fixture bytes, source bindings and this report are bound by `REVIEW-RUNNER-OUTPUT-affadba3.binding.json`. Follow-up review can reuse the unaffected format/parser findings while checking the owner repair and its directly affected environment behavior. Package 2 remains unapproved until that repair has current independent approval.
