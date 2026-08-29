# Independent verification — solver-landing-review-envelope-v3 attempt 3

Verdict: **REJECT**

Verifier: `verify_formation_cure`  
Review: `review-7552b45576c1b208c014fccd`  
Base: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`  
Candidate/artifact SHA-256: `fc01df4dad34dca14970aed0f76d18053afd2dab74ab4aec6ac74cc8f6be36fa`  
Review-envelope SHA-256: `ccbe6fdd073f7e26e704697c1f9b429806082594dcddea1d479383b52440fd4f`

## Decision

Attempt 3 correctly repairs the three exact post-import mutations rejected in attempt 2: verdict regex validation now uses a captured `RegExp.prototype.test`, landing-requirement validation uses captured string/collection operations, and generated-dependency selection uses captured filter/some/regex operations. The mandatory regression guards pass.

The candidate still cannot be approved. A systemic pass over each complete owner interaction found adjacent live intrinsics that reopen the same fail-open classes: the immutable review can mint an empty required-template bar, generated dependency receipts can be suppressed, and lint can be made to disagree with landing enforcement. These are owner-level integrity failures, not unrelated hardening opportunities.

## Owner/history reconstruction

The durable chain remains `d201e8683`/`6eb5e7793` for the three-verb lifecycle, `4f34e3d93` for exact aggregate candidate verification, `f84153e56` for sealed verification bars and category-complete rejection, `7bc1af309` for proof manifests, `2359c7317` for proof-cone selection, and `9436e7cda` for the operator facade. Attempt 3 preserves the intended static ownership split: `review-request.js` composes the immutable envelope; `candidate-snapshot.js` owns exact materialization; `generated-dependencies.js` owns generated companions; `landing-preflight.js` owns deterministic proof/cache selection; `landing-requirements.js` owns review-ready declarations; `verifier-verdict.js` owns verdict ingestion; and `operator-workflow.js` owns final admission/recording. `doneWhen` remains the product-success owner. The rejection concerns fail-open interactions inside those owners.

## Actionable findings

### 1. Required review templates can still be suppressed after import

`scripts/solve/review-request.js:89-117` uses live `Map.prototype.set/get/values`, `Array.prototype.includes/push`, array iteration, and `String.prototype.localeCompare` while constructing the immutable required-template bar. In an isolated exact attempt-3 snapshot, a selective post-import replacement of `Map.prototype.values` made `createReviewRequest` mint `requiredReviewTemplates: []` instead of all nine categories. That reopens the legacy/direct-verdict bypass even though `operator-workflow.js` nominally rejects direct flags when the bar is non-empty.

The same owner still uses live `RegExp.prototype.test` and `String.prototype.trim` in `sourceEpoch` at `review-request.js:83-86`, allowing hostile mutation to alter the source-epoch validation/recording result. Capture every intrinsic used by review construction and source identity, and replace iterator-dependent traversal with indexed/captured operations. Add a post-import mutation guard proving the exact nine-category bar and real HEAD epoch remain unchanged.

### 2. Generated dependency receipt accumulation and traversal remain mutable

`scripts/solve/generated-dependencies.js:90` and `:92` still call live `Array.prototype.push`; the loops at `:76` and `:78` depend on live array iteration. A selective post-import `push` replacement suppressed receipt objects while leaving Node internals operational, returning `hostileEntryCount=0` versus `expectedEntryCount=1`. Replacing `Array.prototype[Symbol.iterator]` with an empty iterator independently produced the same bypass before generator execution.

Capture/bind `push` and avoid iterator-protocol traversal at this integrity boundary (bounded indexed loops over authenticated dense arrays). Extend the regression to mutate `push` and `Symbol.iterator`, not only filter/some/test.

### 3. Landing-requirement lint can be made to disagree with enforcement

`scripts/solve/landing-requirements.js:123` uses `for...of value.reviewReady`. Replacing `Array.prototype[Symbol.iterator]` after import with an empty iterator changes an invalid whitespace-id declaration from one lint problem to `[]`. `landingRequirementsReceipt` later rejects the same declaration, so lint and the landing gate have divergent owners under the hostile environment.

Use the same dense indexed/captured traversal in lint and enforcement and add one shared hostile-iterator parity guard.

## Mandatory regression focus

- `verifier-verdict`: post-import `RegExp.prototype.test = () => true` no longer admits `verifierId: "!invalid"`; the focused guard passes.
- `landing-requirements`: post-import hostile `String.prototype.trim` no longer seals a whitespace-only artifact id; the focused guard passes.
- `generated-dependencies`: post-import hostile `Array.prototype.filter`, `Array.prototype.some`, and `RegExp.prototype.test` no longer suppress the classification-manifest dependency; the focused guard passes.

These fixes are real, but the three adjacent findings above show the owner interactions are not yet intrinsically closed.

## Five prior attempt-1 defects

1. **Legacy flags:** nominal path fixed (`operator-workflow.js:272-290`), and an isolated unpolluted legacy invocation rejects with the structured-verdict-required message without changing the log. Finding 1 reopens it under polluted review construction.
2. **Candidate-local proof plan:** fixed. `assertReviewCurrent` replayed this exact review at `2072/2072`; only the candidate's changed resource/subsystem manifests cause fail-closed full-suite widening.
3. **Strict verdict JSON:** duplicate/escape-equivalent keys are rejected and the mandatory regex mutation is fixed. Systemic intrinsic closure remains incomplete in adjacent review/generation owners.
4. **Future artifacts:** fixed. `{id,kind,path}` is declared before existence and non-empty bytes are bound by SHA-256/size at review.
5. **Evidence identity:** fixed. Template evidence is non-empty, bounded, regular, and recorded durably with path/SHA-256/size.

## Nine required templates

### admission-gating

The unpolluted `land` path orders review, preflight, generated dependencies, template accounting, and verdict parsing before durable recording. However, finding 1 can make the review owner publish an empty template bar, so admission is not fail-closed under the sealed adversarial model. Result: reject through finding 1.

### adversarial-js-intrinsics

Exact JSON, own-key discipline, primitive checks, byte hashing, and the three mandated method captures pass. Numeric fields are server-derived and bounded; JSON removes accessors, symbols, and boxed primitives. Mutable collection operations and iterator protocol still fail at findings 1-3. Result: reject.

### concurrency-serialization

One detached exact candidate snapshot owns proof inputs, generated outputs, and preflight. Review identity replay is exact; callback failure cleanup leaves no worktree or temporary directory. PASS-only cache identity includes source digest, paths, checker/input bytes, proof registry, and runtime. Live A/B, red-on-revert, mutation, timing, load, distributed, random, network, flaky, and host-state proofs remain structurally ineligible for caching. Result: pass.

### formation-circularity

The exact 31-path candidate contains no control-plane, rebalancer, model, or formation-test path. Ambient formation work is absent from the proof widening reasons. Refresh-import-graph-only operates inside the candidate snapshot and does not rewrite the global owner inventory. Result: process self-dependency checked and pass; runtime formation behavior not applicable.

### harness-fidelity

The live scenario harness passes 7/7 guard files and 300 assertions. Exact artifact replay, candidate-local 2072 census, and hostile regression methods bind correctly. Independent hostile `push`, `Map.values`, and iterator reproducers fail through the live owner methods and expose the missing guard coverage. Result: rejection is fail-honest and mechanism-bound.

### recovery-replay

`assertReviewCurrent` reconstructs and compares the full manifest from exact current bytes; missing review/artifact state is not completion. Malformed or missing cached state is a miss. Result: pass outside the review-construction integrity failure.

### retry-loops

No retry/follow-up loop is introduced. Repeated `land` re-derives immutable state, and snapshot cleanup is in `finally`. Result: not applicable; replay/idempotence checked.

### sweep-timer

No periodic sweep, role-gated timer, detection window, or crash-equivalent in-memory recovery is introduced. Checker subprocesses are synchronously bounded. Result: not applicable.

### transport-delivery

No message router, ACK, handler, wake, or response-classification path changes. Verdict delivery is a bounded local regular file. Result: not applicable.

## Exact evidence and commands

- Fresh `git diff --binary --full-index --no-ext-diff <base> -- <31 paths>` is byte-identical to `attempt-3.diff`: 359,795 bytes, SHA-256 `fc01df4dad34dca14970aed0f76d18053afd2dab74ab4aec6ac74cc8f6be36fa`.
- Deterministic sorted `path\0sha256\0size\n` manifest: 31 paths, SHA-256 `89a1f21ab497d834931fcad0899a289fba7519e0b3b575efa59326be44e56cf0`.
- Review replay: `review-7552b45576c1b208c014fccd`, exact fingerprint, proof cone `2072/2072`, no formation problem entry.
- Candidate-local generated outputs match the review: primary `651f1b0a32805f04a3e9f28d5165befe40372216bad6f6d6fed3c4b2c4913f22`; resource `0cb01beb901b94d2b2d2ad377cbee1749c500b734856bf4542308afba5449a71`; subsystem `04165025093ac2de3c67cef52e8fbe269a49a25b61fdf7c261679eaa287256d0`.
- `node test/solve/landing-envelope-contract.test.js`: PASS, focused mandatory hostile regressions green.
- `node scripts/run-solver-landing-review-envelope-scenarios.js`: PASS, 7/7 guard files, 300 assertions, exit 0; report `test-output/reports/solver-landing-review-envelope-v3-2026-08-25T10-43-46-665Z.report.json`.
- Focused ESLint over 15 changed scripts and 6 changed tests: PASS, no diagnostics.
- Selective post-import `Map.prototype.values` replacement in exact candidate: FAIL, required template categories became `[]`.
- Selective post-import `Array.prototype.push` replacement in exact candidate: FAIL, generated dependency entries became `0` instead of `1`.
- Post-import empty `Array.prototype[Symbol.iterator]`: FAIL, generated dependency entries became `0` and invalid landing-requirement lint problems became `[]`.

No source or candidate path was modified. Only this receipt and the paired strict verdict are verifier-owned outputs.
