# Independent re-review: Package 2 standalone test context

**Verdict: APPROVE the bounded source/test correction at both hashes below. F-RUNNER-CTX-1 is resolved for this candidate.** This approval combines the still-applicable reporter/parser review with a new independent real-parent witness of the corrected environment boundary. It is a source approval for the shared runner repair, not a lab, metric-suite, whole-candidate, publication, or main-branch acceptance claim.

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25. The reviewer did not author or modify implementation/test source, commit, compose, or push. Review artifacts and tiny tooling fixtures live outside the author worktree.

## Exact source binding

The author froze this uncommitted delta in `/workspace/scratch/285a938494ce/runner-metric-validation`, branch `work/cloud-package2-runner-metric-evidence-20261025`, on parent `affadba3af02932b36c06242daa87d333a9cfe5d`.

| Reviewed file | SHA-256 |
| --- | --- |
| `scripts/run-test-files.js` | `e5985de5eb28d89cd460efd8a0a537cb2b661ea8563875b34ec6012303431032` |
| `test/scripts/run-test-files.test.js` | `4a2ee81bbc813bd93092a385ec1a9181bbaf43fb90d4944cff72d302d73f41f4` |

Both hashes were verified before and after the independent witness. The exact two-file diff is retained as `reviewed-source.patch`, SHA-256 `0a6439fb0aef055a2714ca0a71d53055f4feec6956c6e6da64efcb20e14d5218`; complete reviewed bytes are in `source-snapshot/`. `review-source-binding.json` records parent identity, worktree status, source hashes and retained prior-review applicability. A later commit may inherit this approval only if these two source files remain byte-identical or an applicable independent follow-up review covers the change.

The first rejection remains historically frozen. Its report SHA-256 is `8e1cdeec94a6c73da6e9d6c7faee2eb8fbeb3e6a2eb32c454d3ea118187f508c`; its binding SHA-256 is `701f2663dc11e6ea482e46e06d6bae429423e1946f1ce683b8348943e585b132`. All 134 artifacts covered by that binding were independently checked and remain unchanged. This is a later approval of repaired source, not a rewrite of the earlier verdict.

## Ownership and source judgment

The only new executable behavior is `delete env.NODE_TEST_CONTEXT` in the existing `prepareTestRun` owner. It operates on the newly constructed child environment after merging `process.env` and `options.env`. Consequently neither ambient context nor a caller-supplied copy can redirect the independently captured test stream into Node's parent serializer. The surrounding comment explains this boundary. Both asynchronous and synchronous launches already consume the same prepared `run.env`.

The parent process's environment and the caller's options object are untouched. Existing Git-pointer isolation and TAP control overrides remain in the same owner path. The change does not modify parser decisions, process-status checks, skip/TODO refusal, incomplete-output refusal, retry behavior, argument selection, source maps, mock-plugin import, compilation-cache settings, heap limit, machine factor, timeout derivation, or deadlines. There is no alternate execution path, binary parser, framework detector, conditional fallback, or caller-specific repair.

Removing the inherited marker at this boundary is consistent with the already-owned standalone subprocess contract. The runner creates its own output descriptors and judges a TAP stream; it has no parent Node serialization channel to preserve. This addresses the recurring cause previously documented by the receipt owner without moving Node semantics into the unrelated Git environment helper.

The added repository regression uses real existing TAP and Node fixtures through `runTestFiles`, with exact counts of three and one, then the Node fixture through `runTestFileSync`, with count one. Its supported `env` option supplies the actually observed `child-v8` marker. It replaces no parser or child outcome and cannot pass merely because the fixture printed a human-readable test count. The standalone case is faithful to the environment seam; the independent witness below additionally exercises real parent inheritance and the CLI.

## New independent evidence

I ran this small real-process tooling witness on Node `v24.22.1`:

```sh
node --test --test-reporter=tap /workspace/scratch/285a938494ce/runner-context-review-evidence/review-real-parent-successor.test.mjs
```

It used the ordinary subprocess execution context approved for this review, following the earlier preserved sandbox `EPERM` diagnosis. No product/native runtime, lab job, corpus, large-output stress case, changed timeout, or changed threshold was involved. Raw driver output is in `real-parent-successor-driver.tap` and `.stderr`; all child TAP/stderr, fixture bytes, CLI output, source hashes and structured results are retained under `real-parent-successor/`.

**Result: all 30 bounded checks passed; the outer Node test completed successfully.** The actual Node test parent supplied `NODE_TEST_CONTEXT=child-v8`. No test seam manufactured that parent state.

| Checked behavior | Independent result |
| --- | --- |
| Rejected predecessor under real inherited context, sync and async | Still reaches the original failure: child status zero, zero TAP assertions, canonical refusal. |
| Corrected runner under the same parent, sync and async | Unchanged Node fixture passes with one assertion; unchanged TAP fixture passes with three. |
| Actual parent → exact canonical CLI → Node fixture | Exit zero, one counted assertion, context forwarded to the CLI and normalized by the source owner. |
| Mixed TAP and Node files under the actual parent | Both files pass; four assertions counted. |
| Explicit `options.env` marker as well as ambient marker | Both launch methods normalize the copied child environment correctly. |
| Existing environment decisions | An unrelated sentinel remains intact, Git repository pointers remain absent, and the existing TAP coverage/skip/TODO settings retain their owner-defined values. |
| Environment isolation | The whole parent environment and its Node context remain unchanged; a frozen caller `options.env` remains unchanged. |
| Skips, TODO, real assertion failure, empty output, spec-only output | Correctly refused through both launch methods under the same actual inherited context. |
| Valid TAP followed by exit 7 | Correctly refused through both methods; output success does not override process failure. |
| Launch arguments | Byte-for-byte equal to the first candidate's vector, including the explicit TAP reporter and existing plugin/source-map flags. |

The predecessor controls and successor cases use the exact production runner modules. The test process, TAP parser, installed loader, file descriptors and canonical CLI are real. No retry or fabricated success hides the first failure. `real-parent-successor/results.json` records all checks and both reviewed source hashes.

## Author evidence independently inspected

The following root-produced outputs were read, hash-verified and copied without modification into `root-produced-evidence/`. They corroborate the source review but are not presented as reviewer-executed runs:

| Evidence | Result | SHA-256 |
| --- | --- | --- |
| `rs-raft-package2-context-predecessor-20261025.tap` | New case red before the owner fix, with `no assertions executed` from the reached child results. | `7a560a2eaa7fe8b60c9f0b704f9f5fe09b0f810a66f2426407627fb7af99d4bb` |
| `rs-raft-package2-context-repaired-20261025.tap` | Same case green after the owner fix. | `d6109cf6a73ba5fd13650f5f4c5b08c7521fe326dec235fa8317b2e4ad539faa` |
| `rs-raft-package2-runner-context-focused-20261025.log` | Canonical runner, classified runner, timeout declarations and complexity selection pass: four files / 97 assertions, jobs=4. | `8950018c96e42437708385974857174203f7f7c29ba8be5d2338ab83718cc56e` |

The predecessor artifact fails at the named format boundary, not because a method or fixture is missing. The four-file result provides current focused caller coverage, including the existing timeout owner, without changing its rules. Original paths and byte counts are retained in `root-produced-evidence-binding.json`.

## Reused evidence and remaining ceilings

The first review's source inspection and small probes remain applicable to the unchanged reporter argument, parser, ordinary-parent format selection, source-map handling, mock-plugin availability, process-error handling and lack of fallback. The new witness re-executes the negative verdict paths affected by context normalization rather than relying solely on textual similarity.

The first review's two extra actual ESM mock-import probes remain **uncompleted on both earlier source versions**. They are not upgraded to passing proof by this approval. The unchanged loader source/configuration and passing plugin-surface fixtures are the bounded evidence for this repair; no new mock-import defect was established. Likewise, the original sandbox failure, the default seven-file timeout result, and the configured seven-file pass on the earlier candidate retain their original identities. They are not relabeled as executions of the newly reviewed source.

Node 24.22.1 is the runtime measured here. The first review's primary-source check established reporter-flag availability at the repository's declared Node minimum; this approval does not certify every supported or future runtime. Current metric acceptance, required lab work, native transport, startup, full static/corpus gates, distributed certification, release publication and exact-main proof remain separate work.

There are **no unresolved blocking findings in this bounded second-attempt source/test correction**. F-RUNNER-CTX-1 is answered by a single change at its proven owner and an actual inherited-context witness. `APPROVE-RUNNER-CONTEXT-SECOND-ATTEMPT.binding.json` binds this report, source snapshot/diff, independent fixtures/results and inspected author logs. No further implementation change is requested by this review.
