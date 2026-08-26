# Independent verification — formation-release-handoff-closure-landing-final

Verdict: **APPROVE**

Verifier: `verify_formation_cure`

Immutable review: `review-1ffe595ddfe3b05c2ffd1cd6`

Review file SHA-256: `f39d1c9dbb5aee6cab03164f9e2c069869f10e6934c4a02fbbd8c6626ea4cdd4`

Base: `ee021cb62b3b98c5903d4ed7951e6fec5658216b`

Exact candidate/aggregate: `sha256:18ffa3ed6fe83968ce906cd528d0237a3764bd3129c4a15768c8fb2d18d71668` (597,721 bytes, 79 paths)

Ordered path/content manifest: `sha256:6453be301bd6aa2ef8f945f482b2c62e6f2cd747f1e06d580b58c935b49f5e95`, computed over each review-ordered `path NUL size NUL content-sha256 LF` record.

## Outcome

The exact refreshed candidate is approved. Solver's `assertReviewCurrent` passes for the immutable review and resolves the same candidate and aggregate fingerprint. Its content-bound cached proof receipt is `pass` and covers 2,082/2,082 classified tests. The three generator-owned test classification manifests exactly match the immutable review's recorded SHA-256 and sizes.

The prior category-complete approval was reused only after proving byte identity except for the already adjudicated mechanical accumulator rename. The existing startup-authority snapshot owner still atomically normalizes the canonical own-data `priorityPartitionSummary.satisfied` boolean with the merged recovery-reason vector. Exact `false` supplies/preserves `priority_partitions_not_spread`; exact `true` removes only that contradictory derived reason from both publication and target-participation inputs; absent/malformed predicates stay fail-closed; unrelated reasons and explicit BLOCKED state are untouched. Renaming the private local accumulator from `reasonCodes` to `values` changes neither data flow nor authority; the decision-boundary audit now reports zero violations. The closure owner and its release policy are not weakened.

The systemic interaction remains single-form. The startup-authority snapshot owner normalizes whole-plane evidence; one subordinate formation-release closure owner captures, fences, retains, and terminates a generation; one publication coordinator serializes exact durable contracts/readback; bootstrap and joining readiness consume the seed owner's projection; rebalancer recovery consumes the same narrow handoff identity; the raw stdout capture owner feeds one bounded scenario evidence journal; and the analyzer alone canonicalizes unordered evidence. No consumer mints parallel authority.

The refreshed v17 archive is truthful and content-bound. Three fixed runs pass with cohorts/consumers 2/2, 2/2, and 3/3 in 2,244 ms, 12,314 ms, and 18,636 ms. Every fixed run has 5/5 boot proof, exactly one qualifying generation, zero malformed/early transitions, zero formation timeouts, no revocation, and exact live-vs-post-stop agreement. Two exact 79-path aggregate-revert runs have 5/5 boot proof but 0/2 strict closure and are recorded fail-honestly; neither is mislabeled as the unobserved narrow projection-omission classifier. The pre-symmetric-normalization fixed falsifier is separately archived and excluded from final exact-source success evidence.

The TLC archive is also exact. The pre-run receipt binds clean fixed HEAD `710078448373ed8e1b754fa780a88aefc1c6475f`, candidate `18ffa...71668`, controller/release/source/build identities, and 17 ordered model/config/runner inputs under manifest `29f2f6f59b1a48ecc74c8c078c1475b137d317d3b1c1731830831e3de1d73afe`; every listed size/hash matches the current candidate. The final receipt binds pre receipt `77e4c7f9...0424`, clean before/after state, log SHA-256 `5c3a4eac3957f463e7fb1f7777326e92d67ef7d516671eae015619cfb5cc2aec`, and 12 archived report hashes. All fixed/coverage modes converge and each mutant fails its intended causal oracle.

## Required review templates

### admission-gating — completed

The join barrier distinguishes unavailable/indeterminate authority, positive insufficiency, exact captured-self handoff, and established outsider floor. Once self handoff is captured, only exact authorized release can pass; outsider floor bypass is unavailable to that lane. Precheck and enforcement consume the same normalized authority contract. The symmetric normalization cannot turn unknown or false spread into READY: it removes the exact stale negative reason only when the canonical own-data predicate is exactly true. All unrelated safety/admission reasons remain blocking. Existing 60-second certification, 120-second internal barrier, CL-036/remove safety, retry limits, and admission floors are unchanged. Evidence: both decision tables, `startup-authority-snapshot-owner.js`, joining readiness owners, closure owner, and the focused 74/74 snapshot test.

### adversarial-js-intrinsics — completed

Snapshot, durable-row, transport-envelope, journal, and analyzer inputs are read through own-data descriptors and primitive checks. Inherited/accessor/coercive identities fail closed without getter invocation. Changed collection/string/JSON/number paths use module-load captures or indexed copies, not hostile iterators. The symmetric helper adds no external read or coercion: it compares already-normalized primitive strings with the already-normalized boolean and uses captured `Array.isArray`, `includes`, and `push`. Numeric boot/epoch fields retain the nonnegative safe-integer grammar; generation identity remains length-prefixed and injective. Existing hostile `Object`, `Array`, `Map`, `Set`, `String`, `JSON`, `Buffer`, `Boolean`, accessor, and numeric witnesses remain in the exact 79-path candidate.

### concurrency-serialization — completed

The closure owner remains the synchronous generation authority. Publication uses one constructor-owned coordinator with one in-flight write plus latest desired exact contract. Stale ACTIVE callbacks cannot acknowledge after terminal intent, and only exact durable readback commits release or terminal high-water. Planner/rebalancer wakes remain idempotent nudges through existing claim/serialization owners. Raw stdout has one capture sink and the evidence journal performs bounded synchronous append/dedup without becoming runtime authority. The symmetric snapshot change is a pure per-answer construction and introduces no await, lock, listener, or writer.

### formation-circularity — completed

The circular cone remains explicit: spread formation waits on JOINING participation; JOINING readiness waits on release; distributed publication reads can be blocked by the same planning snapshot; and cure planning needs the held cohort. The single interaction owner breaks the circle through seed bootstrap projection and reciprocal current-primary identity, not a second store or bypass write. Base projection discovers but never authorizes; exact durable ACTIVE plus physical boot/fence evidence authorizes captured members. Symmetric normalization prevents adjacent cache observations from turning canonical spread=true into false recovery authority without accepting stale positive evidence. Model cadence charges request, poll sleep, non-monotone reopen, stable window, publication, and terminal readback inside unchanged budgets.

### harness-fidelity — completed

The scenario journal attaches to the sole raw stdout owner before cluster start and fails closed on overflow, replay/sink error, missing seed, malformed evidence, or aggregate deadline exhaustion. Live and post-stop analysis share one analyzer and compare canonical consumer sets; permutation witnesses exclude callback/filename order artifacts. Fixed and reverted arms bind exact commits, controller/release/source/build digests, and a full 79-path reverse artifact. The staged gzip SHA-256 is `95edd3fbac19cf1c09ac54efe33d46513d0ebc768098fc9f21b0bbf311b15da8`; decompression exactly reproduces raw reverse SHA-256 `052aba54e00ba4ebd629d50b62290a127ebe39366afada300e5cc4ddbf6afe8b`. Its 79 diff records are in manifest order and every fixed-side blob ID equals the reviewed candidate index.

The symmetric witness is causal. Its upstream `targetParticipation.reasons` explicitly contains `priority_partitions_not_spread`, then the exact true summary must yield READY and an empty final reason list. On the identical test bytes with only the snapshot-owner source reverted, the upstream assertion passes and the test exits 1: old source returns `recovery_pending`, `ready=false`, and retains the stale reason, failing the three named owner assertions. Current exact bytes pass 74/74. The archived pre-fix report SHA-256 `e612e87e014c00050f2cd8b4ae34c1e176515432044b04b140b39aa0ffd04cf9` records the same live contradiction and revocation, while the three final fixed reports bind the corrected source.

### recovery-replay — completed

Restart restoration accepts only canonical durable rows tied to current authority node and boot. Durable ACTIVE restores a generation without local release until exact current evidence/readback; durable COMPLETE/REVOKED restores terminal high-water without requiring an old local ACTIVE callback. Pre-durable authority restart is boot-disjoint and nonauthorizing. Pending terminal intent cannot be cancelled by later observation, and only exact terminal readback clears the active generation. Missing or unreadable rows never prove completion. Symmetric reason normalization is stateless and deterministic, so replaying the same planning answer cannot mint a different owner or authority.

### retry-loops — completed

No attempt ceiling or timeout is widened and no arbitrary sleep is introduced. The existing JOINING poll is the re-drive owner; its bounded GET uses the resolved poll interval, charging one request tick plus one sleep tick. Publication retries funnel through the single-flight coordinator and re-read exact durable state. Terminal, timeout, shutdown, malformed, and unavailable exits are explicit; late success is an idempotent evaluation rather than duplicate mutation. The snapshot normalization adds no loop. The final live runs demonstrate prompt release within the existing window.

### sweep-timer — completed

No sweep, interval, or timer is added. Existing fake-clock/poll seams stay deterministic and the HTTP deadline derives from established JOINING cadence. Scenario observation charges replay plus tail against one inclusive 60-second deadline and rejects nonfinite, regressed, or over-budget clocks. The 120-second internal barrier remains unchanged. TLC explicitly models request/sleep cadence and terminal timeout and prevents post-timeout evidence.

### transport-delivery — completed

Seed projection uses the existing bounded bootstrap `/ready` path with optional projection identity and no blocked distributed-read fallback. The seed remains authority; responses authorize only exact cohort members with current authority/self boot. Accepted incoming primary connections emit a one-shot reciprocal IDENTIFY so dialling joiners can prove the seed without opening external admission; hostile/inherited/accessor frames fail closed and no ping-pong is introduced. Undeliverable GET/POST calls abort within the cadence budget and return retryable absence rather than hanging. Transport acknowledgment alone is never formation authority. Symmetric reason normalization is upstream of transport projection and does not alter delivery outcome semantics.

## Exact commands and evidence

- `assertReviewCurrent(...)` for `review-1ffe595ddfe3b05c2ffd1cd6`: PASS; candidate/aggregate `18ffa...71668`, cached exact-content proof PASS, 2,082/2,082 selected tests.
- Exact review-path binary/full-index diff: 597,721 bytes, SHA-256 `18ffa3ed...71668`; 79 paths.
- Ordered review-path content manifest: SHA-256 `6453be30...f5e95`.
- Generated dependencies exact: primary `2d78ae24...741c1a` / 149,076 bytes; resource `44a2ad43...29a591` / 156,104 bytes; subsystem `e8c7495d...2d569b` / 173,537 bytes.
- Symmetric owner/test file hashes: `74cb8ac0...2dca`, `3d20f255...85a6e2`; focused test PASS 74/74; source-only revert causal RED; selected ESLint and candidate-path diff check PASS; decision-boundary audit 0 violations.
- Archive manifest SHA-256 `dd84be3b...5ce4`; summary JSON `b0c5f294...107d0`; summary Markdown `ed83637d...5ab8`.
- Fixed report hashes: `3e30a91f...b22f`, `d44e418a...b18`, `8e5f0e37...e4ba`; all strict PASS, N≥2 exact cohort/consumer parity, zero malformed/timeouts.
- Reverted report hashes: `304d74e2...b70`, `e2741e4f...413a`; strict 0/2 with 5/5 boot proof and fail-honest unclassified outcomes.
- Pre-fix falsifier: `e612e87e...04cf9`, separately archived and excluded from final success counts.
- Reverse raw/gzip parity: raw `052aba54...e8b`, gzip `95edd3fb...5da8`; decompression byte-equal; 79/79 fixed-side blobs match current index.
- TLC pre receipt `77e4c7f9...0424`; ordered input manifest `29f2f6f5...73afe`; log `5c3a4eac...c2aec`; final receipt `72d00079...792a`; 17/17 inputs exact and 12/12 expectations met.
- Local verification remained thermally narrow; no broad suite, TLC, or live cluster was rerun.

No source, Quest, review, or append-only log file was modified by the verifier. Only this authorized receipt and its strict verdict were written.
