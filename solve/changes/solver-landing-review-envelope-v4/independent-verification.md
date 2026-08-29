# Independent verification — solver-landing-review-envelope-v4 attempt 3

Verdict: **REJECT**

Verifier: `verify_formation_cure`  
Review: `review-9fcc0cef7307e5f3e1a53f48`  
Base: `a00df079c5a2bea5e2143f46e2662f9f95f5d7b4`  
Candidate/artifact SHA-256: `0307802fff4d63003992bcb5697ab819f50884cb99f7c2ba061341d6f49b0c7f`  
Review-envelope SHA-256: `914971b633138f39f6e58c523e8cce1c2dcdcef6e6b9d4a49d6195d20d926bb0`  
Ordered path/content manifest SHA-256: `e70758cd19667566674fa17b82f52c44470a6268f08e91a6e836e991afdc0c03`

## Decision

Attempt 3 closes the exact attempt-2 reproducers inside `boundVerifierRejectionEvents`, the central loop of `projectState`, and `candidateVerificationState`. The new guard keeps its selective `Array.isArray`, iterator, slice, Set-has, and regexp attacks active for bound-rejection and state projection, and keeps slice/regexp attacks active for candidate-rejection replay. Exact append content, rejection reopening, bound recognition, candidate recognition, and terminal refusal are green for those selected attacks.

The Quest's declared result is broader: one owner per interaction with fail-closed hostile-runtime verification. The full structured-verdict -> append -> log replay -> state/verification projection interaction remains split across partially hardened and live intrinsic paths. Exact post-import reproducers corrupt the serialized event, corrupt the replayed event, erase projected rejection findings, erase the current candidate/rejection, and remove the required aggregate-approval problem. The green guard avoids these live methods and restores three mutations before `verificationState`; it therefore does not prove the full interaction. This is a systemic owner-boundary rejection, not a request for isolated substitutions at the observed lines.

## Owner and history reconstruction

The history remains: `d201e8683`/`6eb5e7793` own the three-verb lifecycle, `4f34e3d93` exact aggregate verification, `f84153e56` sealed category-complete rejection, `7bc1af309` proof manifests, `2359c7317` proof-cone selection, and `9436e7cda` the operator facade. V3/v4 assign immutable review composition to `review-request.js`, exact materialization to `candidate-snapshot.js`, generated companions to `generated-dependencies.js`, proof/cache policy to `landing-preflight.js`, evidence readiness to `landing-requirements.js`, strict receipt ingestion to `verifier-verdict.js`, and admission/event construction to `operator-workflow.js`.

The unresolved interaction begins where `operator-workflow.js` hands its canonical event to `store.js`. `store.js` serializes, re-parses, and projects it; `verification.js` independently reconstructs candidate and aggregate obligations from the same log. Those tail owners still invoke live mutable intrinsics after import. A coherent fix must harden this entire interaction cone and its tests together; adding captured calls only to the most recently reproduced local loop leaves another consumer able to reinterpret the same authoritative bytes.

## Actionable findings

### 1. The durable append and replay boundary can rewrite canonical verdict data

`scripts/solve/store.js:183-188` calls live `JSON.stringify` when appending the supposedly canonical event. An isolated post-import replacement changed a valid verifier-rejection from `evidence: subagent:exact` with one category-complete finding to durable bytes containing `evidence: subagent:forged` and `findings: []`.

`scripts/solve/store.js:191-197` then calls live string `split`/`trim`, array `filter`/`map`, and `JSON.parse` while replaying the ledger. A second isolated post-import replacement of `JSON.parse` changed unchanged on-disk bytes to the same forged evidence and empty finding list in memory.

Capture/bind serialization and parsing plus the string/array traversal at the store owner, or route both directions through one hardened canonical event codec. Assert exact verifier evidence, findings, claim, fingerprint, review id, and template evidence both in raw bytes and after hostile replay.

### 2. `verificationState` still derives security decisions through live array/Set/regexp/string operations

The recently hardened `candidateVerificationState` loop at `scripts/solve/verification.js:834-856` is only one consumer. Its upstream candidate and aggregate construction remains live:

- `laterApproval` uses live slice/find at `315-317`; replacement coverage uses live Set/every/has and iteration at `346-425`.
- canonical delta/untracked validation uses spread iterators, Set, sort, regexp test, split/some/startsWith, and trim at `427-478`.
- aggregate construction uses map/some/filter/flatMap/find, Set constructors, spread iterators, and sort at `522-578`.
- checkpoint/replacement selection uses live map/filter/Set/has at `590-658`.
- candidate construction uses live filter/flatMap/map, Set/spread/sort, regexp test, and join at `676-740`.
- the top-level fold uses live map, iteration, slice/find, push/spread, reverse/find, filter/map, and Set operations at `966-1085`; downstream checkpoint/terminal problem projection repeats live iterators and push at `1092-1194` and `1246-1248`.

On the exact current log, a selective post-import `Array.prototype.filter` replacement on the candidate-attempt collection changed `attempts=3`, candidate fingerprint `030780…c7f`, and `candidateRejection=true` into `attempts=3`, `candidate=null`, and `candidateRejection=false`. This directly falsifies the required full durable replay under the prior filter attack.

Harden candidate, aggregate, and problem projection as one verification owner using the already captured methods plus indexed traversal. Do not stop at line 684: the listed upstream and downstream calls jointly determine the review fingerprint and whether verification obligations exist.

### 3. Live `push` can erase a mandatory aggregate-approval gate

`scripts/solve/verification.js:974-1049` captures several problem collections but appends through live `.push`; `terminalVerificationProblems` returns them through live spread at `1246-1248`. A selective post-import `Array.prototype.push` replacement changed `terminalVerificationProblems` for the exact attempt-3 candidate from the required aggregate-approval problem to `[]`. The corresponding audit lost that verification problem while unrelated fresh-probe evidence remained.

This is not diagnostic-only: `operator-workflow.js:238-260` treats the projected problem cardinality as landing admission state. Use captured/indexed problem accumulation and copying throughout verification and audit. Add a negative control where no aggregate approval exists and hostile push/filter/iterator methods remain active through `terminalVerificationProblems`, `auditQuest`, and the landing gate.

### 4. State projection can erase the rejection record even when reopening survives

Attempt 3 hardens the main `projectState` map/Set loop at `scripts/solve/store.js:442-490`, but `applyFinding` still appends through live `frontier.findings.push` at `266-277`. On the exact durable v4 log, a selective post-import push replacement changed projected verifier-rejection findings from `2` to `0`. Quest status happened to remain solved in both projections because a later attempt re-terminalized it; the projection nevertheless lost the authoritative rejection history and all exact claim/evidence/finding content.

Use the captured `arrayPush` in every helper reachable from the state fold, including findings and theory records. Assert the projected rejection object itself, not only raw `readLog` content and `questStatus`.

### 5. The hostile-tail guard excludes the methods that still fail

`test/solve/operator-workflow.test.js:785-930` mutates every/map/trim/startsWith/regexp for append and adds isArray/iterator/slice/Set-has for selected replay checks. It never mutates JSON stringify/parse, filter, some, or push at the durable interaction. It restores `Array.isArray`, the array iterator, and `Set.prototype.has` before calling `verificationState` at lines `906-912`, and validates exact claim/evidence/findings only on the raw object returned by `readLog`, not the projected frontier finding.

Keep the complete prior attack matrix active across append, raw-byte inspection, `readLog`, `boundVerifierRejectionEvents`, `projectState`, `verificationState`, `terminalVerificationProblems`, audit, and terminal admission. Separate controls may be used when one mutation intentionally targets a different data shape, but each owner interaction needs a non-vacuous hostile assertion.

## Prior defect matrix

### V3 attempts 1-3

Legacy flags enter immutable review; candidate-local proof selection excludes ambient work; exact JSON rejects duplicate and escape-equivalent keys; future artifacts bind at review; evidence is non-empty and SHA/size-bound. Captured verdict regexp, landing trim, generated filter/some/regexp, review Map/array/regexp/locale/iterator, generated push/iterator, and lint traversal protections remain present. Direct/legacy bypasses and incomplete template accounting remain negative.

### V4 attempts 1-2

Canonical verifier attribution, findings/claim copying, and terminal comparisons now use captured methods through event construction. Attempt 3 captures `Array.isArray`, Map/Set constructors and methods, and indexed loops in the exact attempt-2 store/rejection projection sites. These local closures are green. Findings 1-5 are the adjacent interaction cone exposed by the category-complete replay.

Exact JSON plus strict own-key schemas reject duplicate, excess, inherited-through-JSON, boxed, accessor/non-data, link, missing-evidence, malformed-id, polluted-array, and incomplete-template inputs before append. No source compatibility regression was observed in the legacy/direct path tests.

## Nine required templates

### admission-gating

Terminal refusal remains correct under the named `includes` attack, and attempt-2 rejection reopening survives the new selective Set/iterator attacks. Live push can nevertheless remove the required aggregate-approval problem consumed by the landing audit. Result: reject through finding 3.

### adversarial-js-intrinsics

The named v3 ingress, review, generated-dependency, lint, append-copy, and selected replay attacks pass. Live JSON serialization/parsing, string/array log traversal, candidate/aggregate construction, verification problem accumulation, and projected finding accumulation remain mutable. Five exact outcome-changing reproducers are recorded. Result: reject through findings 1-4.

### concurrency-serialization

The detached exact snapshot owns source, generated outputs, proof selection, and cleanup. Immutable replay recomputes the exact manifest. Cache keys remain candidate/input-cone/runtime bound and exclude live A/B, mutation/red-on-revert, distributed, timing, load, network, random, flaky, and host-state proofs. Result: pass.

### formation-circularity

The exact 33 candidate paths contain no formation, control-plane, rebalancer, model, or formation-test path. The candidate-local 2072-test full-suite cone includes ordinary repository formation tests but has no ambient formation candidate/problem path. Result: process circularity checked and pass; runtime formation behavior not applicable.

### harness-fidelity

Focused guards and the serial scenario suite pass against real owners. The new tail guard is causally stronger than attempt 2, but it omits the failing serializer/filter/push attacks, restores part of the hostile environment before `verificationState`, and checks raw rather than projected finding content. Result: reject through finding 5.

### recovery-replay

`assertReviewCurrent` reproduces the immutable review, candidate, generated dependencies, and proof plan. The durable event is not replay-stable under post-import mutation: unchanged bytes can yield forged verifier content or lose the candidate/rejection/problem projection. Result: reject, represented by the sealed adversarial and admission findings.

### retry-loops

No retry/follow-up loop is introduced. Repeated land calls recompute current state and review. Result: not applicable; repeated-replay behavior inspected.

### sweep-timer

No sweep, timer, role-gated action, or crash-equivalent periodic state is introduced. Proof processes are synchronously bounded. Result: not applicable.

### transport-delivery

No runtime router/ACK/wake behavior changes. The analogous interaction fails: successful append is not equivalent to canonical durable processing when serializer, replay, and projection owners can change the event. That failure is captured under adversarial/harness categories; runtime transport is otherwise not applicable.

## Exact evidence and commands

- Artifact SHA/size: `0307802fff4d63003992bcb5697ab819f50884cb99f7c2ba061341d6f49b0c7f`, 397,189 bytes. Review SHA: `914971b633138f39f6e58c523e8cce1c2dcdcef6e6b9d4a49d6195d20d926bb0`.
- Fresh 33-path `git diff --binary --full-index --no-ext-diff` is byte-identical to `attempt-3.diff`. Deterministic sorted `path\0sha256\0size\n` manifest SHA-256: `e70758cd19667566674fa17b82f52c44470a6268f08e91a6e836e991afdc0c03`.
- `assertReviewCurrent`: PASS with exact candidate/aggregate fingerprint and candidate-local proof `2072/2072`; only the intended resource/subsystem generated manifests force full-suite widening.
- Generated outputs exactly match review SHA/size: primary `651f1b0a…13f22`/148271, resource `0cb01beb…a71`/155259, subsystem `04165025…56d0`/172611.
- `node test/solve/landing-envelope-contract.test.js`: PASS 18/18.
- `node test/solve/operator-workflow.test.js`: PASS 106/106; hostile-tail subtest 8/8.
- Serial `node scripts/run-solver-landing-review-envelope-scenarios.js`: PASS for legacy, v3, and v4; each 7/7 guard files and 310 assertions. V4 report: `test-output/reports/solver-landing-review-envelope-v4-2026-08-25T12-07-06-202Z.report.json`.
- Focused ESLint across 17 changed scripts and 6 changed tests: PASS, no diagnostics.
- Hostile JSON stringify during append: durable evidence `subagent:exact -> subagent:forged`, findings `1 -> 0`.
- Hostile JSON parse during replay: unchanged event evidence `subagent:exact -> subagent:forged`, findings `1 -> 0`.
- Hostile candidate filter: exact candidate `030780…c7f -> null`, candidate rejection `true -> false`.
- Hostile verification-problem push: terminal verification problems `1 -> 0`.
- Hostile projected-finding push: projected verifier-rejection findings `2 -> 0`.

No candidate, product, or formation source was modified. Only this verifier-owned receipt and paired strict verdict were updated.
