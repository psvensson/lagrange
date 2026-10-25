# Package 2 — metric regression and canonical test-runner proof

**Final source:** normally hooked local commit
`2dd9c9c5a3750e9cde947feb7be5f3780d5133b6`, Git tree
`0f91cbaaf8606b14dd89283ad9c2d893bdbfd22f`, on first reporter repair
`affadba3af02932b36c06242daa87d333a9cfe5d` (remote `57cef6e93129a878be105076ff8dd85155a8aac4`,
matching parent tree `da881d26b995eaedda249987a086d07e116969ac`).
The frozen source checkpoint beneath the repair is `f30060e714d080ba438f5657b8d15f4bb992b107`
(remote `13cdfe4ef1b620037c0c5f326dd6ff0193f0a70d`). This packet measures
the unchanged independently approved metric-provenance source together with
the canonical TAP reporter and nested-context repairs. It is **cloud-host
regression evidence**, not a home-lab receipt, whole-corpus pass or permission
to merge into main.

## Scope and source ownership

The focused selector exactly matches the seven files in the already reviewed
offline `metric` Lab job:

1. `test/scripts/metric-report-provenance.test.js`
2. `test/scripts/metric-report-inputs.test.js`
3. `test/scripts/metric-cycle-resolution.test.js`
4. `test/scripts/metric-cycle-custody.test.js`
5. `test/scripts/metric-duplication-inputs.test.js`
6. `test/scripts/inventory-ordinal-segments.test.js`
7. `test/scripts/complexity-ratchet-closure.test.js`

The runtime-source differences from the frozen composition both belong to
`scripts/run-test-files.js`: the `--test-reporter=tap` argument in its sole
child argument vector and a child-environment correction in `prepareTestRun`.
The approved metric producer, input-digest and provenance source is unchanged.
The format owner change addresses a systematic
Node version contract: Node v23 changed the default non-TTY `node:test` reporter
from TAP to human-readable spec while the repository's sole result parser
continues to accept TAP. Primary documentation:
<https://nodejs.org/api/test.html#test-reporters>.
The older `runner-output-bound` Quest and historical proof receipt already
required complete streaming TAP accounting and explicitly selected the TAP
reporter in a separate Node invocation. There is no legacy parser, output
heuristic, automatic retry or permissive empty-output success path in this
repair. A second shared defect surfaced during independent review: a supported
`node:test` parent sets `NODE_TEST_CONTEXT=child-v8`, and the runner forwarded
that internal serializer context to standalone TAP children. An exact real
parent test reported binary V8 events and zero TAP assertions on both the
baseline and the first reporter candidate. Clearing only that inherited
context at the **existing** per-test environment owner repairs synchronous
and asynchronous launches; it does not change or inspect test output.

The new runner regression exercised mixed TAP/Node async children and a Node
sync child with the real inherited value. It was **red against the unchanged
first reporter candidate**, with two explicit `no assertions executed`
findings, then **green after the environment correction**, counting the
expected `[3,1]` async assertions and one sync assertion. Its unchanged
one-case direct Node predecessor and successor artifacts are:

| Targeted first attempt | SHA-256 | Verdict |
| --- | --- | --- |
| `/tmp/rs-raft-package2-context-predecessor-20261025.tap` | `7a560a2eaa7fe8b60c9f0b810a66f2426407627fb7af99d4bb` | Red: bound context defect engaged |
| `/tmp/rs-raft-package2-context-repaired-20261025.tap` | `d6109cf6a73ba5fd13650f5f4c5b08c7521fe326dec235fa8317b2e4ad539faa` | Green: same selected test |

After both corrections, the canonical runner/timeout/format selection passed
**4 files / 97 assertions** on this host, with unrestricted fixture-child
execution. Raw log: `/tmp/rs-raft-package2-runner-context-focused-20261025.log`,
SHA-256 `8950018c96e42437708385974857174203f7f7c29ba8be5d2338ab83718cc56e`.

## Independent source review

The first independent review [REVIEW-RUNNER-OUTPUT-affadba3.md](REVIEW-RUNNER-OUTPUT-affadba3.md)
**rejected** the original reporter-only source for `F-RUNNER-CTX-1`. Its
[exact review binding](REVIEW-RUNNER-OUTPUT-affadba3.binding.json) remains
unchanged, including the observed real-parent failure and 134 evidence
artifacts. The later independent
[APPROVE-RUNNER-CONTEXT-SECOND-ATTEMPT.md](APPROVE-RUNNER-CONTEXT-SECOND-ATTEMPT.md)
**approves** the single-owner environment repair, binding the actual bytes:

| Approved file | SHA-256 |
| --- | --- |
| `scripts/run-test-files.js` | `e5985de5eb28d89cd460efd8a0a537cb2b661ea8563875b34ec6012303431032` |
| `test/scripts/run-test-files.test.js` | `4a2ee81bbc813bd93092a385ec1a9181bbaf43fb90d4944cff72d302d73f41f4` |

The [later review binding](APPROVE-RUNNER-CONTEXT-SECOND-ATTEMPT.binding.json)
covers 77 evidence files. Its real `node --test` parent verified 30
checks: Node supplied the inherited context, the original source remained
red, the repaired shared owner allowed TAP/Node async, sync and canonical CLI
success, and skipped, TODO, failed, empty, spec-only and nonzero-exit paths
still refused. No alternate runner, fallback parser or per-caller exception
was introduced. This is **independent source approval**, distinct from
full-candidate or Lab acceptance.

## Recorded outcomes

All runs used Node.js `v24.22.1` on the same Linux cloud host. Local source,
tests, fixture bytes, ratchets and metric producer inputs were unchanged.
`npm run test:file` resolved to the repository's classified runner.

| Original invocation/profile | Terminal outcome | Applicability |
| --- | --- | --- |
| Default sandbox, jobs 4, no timeout floor | **FAIL**, 4/7 files passed, 180 counted assertions | The sandbox refused `spawnSync` Node children with `EPERM`; callers checking only child status got `0` with empty stdout. Both the original and reporter-repaired source exhibit this refusal in paired independent probes. Do not call these substantive failures. Provenance also timed out. |
| Subprocesses permitted, jobs 4, no timeout floor | **FAIL**, 6/7 files passed, 197 counted assertions | All six other files passed, including original JSON child regressions. The provenance file's first substantive case took 33.159 seconds; its next case took 2.307 seconds; TAP reported a timeout after 35.485 seconds despite 30 substantive assertions passing. This is an actual **default-budget red** and remains recorded. |
| Subprocesses permitted, existing CI `TAP_TIMEOUT_FLOOR=120`, `LAGRANGE_LANE_JOBS_CAP=1` | **PASS, 7/7 files, 196 counted assertions** | Exactly the existing CI floor and single-lane Lab scheduling; no source deadline or assertion changed. Provenance finished with 32 counted assertions in 32.957 seconds; the other six files passed with 164 assertions. This run preceded the child-context correction and remains a separate source-bound measurement. |
| **Post-hook commit `2dd9c9c`, same existing CI profile** | **PASS, 7/7 files, 196 counted assertions** | The final committed runtime/test tree was measured again, with the reviewer-approved context correction present. Provenance passed 32 assertions in 34.588 seconds; the other six files passed 164 assertions. This remains a cloud CI-profile measurement rather than a canonical Lab receipt. |

The raw logs remain in the cloud execution workspace and have **not** been
accepted by the repository's separate original-evidence publication owner.
Their SHA-256 values bind the reported first attempts:

| Local raw artifact | SHA-256 |
| --- | --- |
| `/tmp/rs-raft-package2-seven-files-20261025.log` | `85b4c9c07492b896695e26c7734958f4c4daf23737824fd48442b7996fc44902` |
| `/tmp/rs-raft-package2-seven-files-escalated-20261025.log` | `459ad17f3c1dab7018b411272f810f3e4bb5d85cfa47e8e1a1780bc2408f8d26` |
| `/tmp/rs-raft-package2-seven-files-ci-floor-20261025.log` | `da36cccb8358651c13cc00ae936ca70eb27e086770cfbb5d090f0ac064e0c64e` |
| `/tmp/rs-raft-package2-posthook-seven-2dd9c9c-20261025.log` | `9308f1eff2d69612b7ffa3a04132a9d9b199af82552d628a75c9770998729548` |

The earlier small canonical runner/protection cone passed **3 files / 74
assertions** and independently exercised mixed TAP/Node outcomes, rejected
skips/failures and refused empty streams. See the
[`RUNNER-OUTPUT-OWNER-REPAIR-20261025.md`](RUNNER-OUTPUT-OWNER-REPAIR-20261025.md)
review packet for its unchanged fixture and source evidence.

## Why the red cannot be discarded

Sandbox subprocess refusal is demonstrated by an explicit child error and
reproduces on both old and changed runner source; it is environmental to the
cloud runner. The timeout remains a separate genuine outcome of the normal
local profile on this host: the fixture executes a substantive full metric
producer/reader cycle repeatedly and has independently measured runtimes near
and above TAP's 30-second default. An earlier author measured up to 23.365
seconds on another host. The repository's CI suite already supplies a
120-second floor; this additional run used that existing lane policy and did
not change the default run's status, increase a ratchet, alter producer work,
or reclassify the test. The package does not claim performance clearance under
the local default.

## Remaining acceptance boundary

The original reviewed Lab `metric` job still pins
`0e6923bb82fb83db3015b51e7f48ae1336d5f581` and must be executed by the
existing controller after the canonical fresh-seed stage. The same metric
source is composed here, but this cloud test is not its original Lab receipt.
Full static/corpus and release certification belong to the broader cutover.
The normal repository hooks completed at `2dd9c9c` without a bypass. The
post-hook source/test SHA-256 values match both independently approved bytes
listed above. The hook regenerated the declared impact/inventory metadata;
its scoped report still identifies the pre-existing `retryFailedOnce`
complexity 16 against a scoped limit of 12, and no ratchet changed. Original
normal-hook log `/tmp/rs-raft-package2-normal-hooks-20261025.log` has SHA-256
`6fb99905631624748196e59c2969c146df90034fc9de311ad4d40c88ad86c962`.
The frozen `13cdfe4` executable branch and `main` have not moved.
