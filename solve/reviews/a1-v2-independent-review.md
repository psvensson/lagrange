# A1-v2 independent review

## Verdict

**NOT APPROVED — blocking findings remain.** This is a review-only verdict; do not merge.

Reviewed candidate subject: `fc4b943f7ef307b2f922b0271dd2a3e8a80d3b88`.
The current review-request head is `5a22276757e74dabac9fd620aa30c3552c43a773`.
The verdict is content-bound to the five payloads below, not to any later candidate.

| Candidate payload | SHA-256 |
| --- | --- |
| `solve/quests/partition-key-ordering-owner-completion-v2/evidence/candidate-src-split-key-comparator.js` | `39fdd605441277ea33fbd42add6c150187c75dfae8715680ad63bd96951130c3` |
| `solve/quests/partition-key-ordering-owner-completion-v2/evidence/candidate-src-split-merge-core.js` | `f62e4d1cbe1c07c1a01c6f16d736fef73a6598a287c6fa7040f04989fffa5595` |
| `solve/quests/partition-key-ordering-owner-completion-v2/evidence/candidate-src-split-merge-evaluation.js` | `f5181ae0ebe5145a2ba536b575086abdf48771ba8f76805d818de95604848e2c` |
| `solve/quests/partition-key-ordering-owner-completion-v2/evidence/candidate-test-routing-key-comparator.test.js` | `dd90c8e93b2aa4495bf8c9b58189afb2574beb1db81c0036f095bb4a3c846db8` |
| `solve/quests/partition-key-ordering-owner-completion-v2/evidence/candidate-test-merge-auto-execution.test.js` | `c5e0eae63439da09d21f1e30acdfe2c2c9599b1669c552e1017266829f1ed891` |

All five SHA-256 values match the required digests in `evidence/independent-review-request.md`.

## Harness fidelity

**Pass for the two behavioral controls.** GitHub Actions run `36996246393`, job `110803509969`, copies these same two candidate tests into their normal test paths, runs them against the sealed source, then installs the candidate source and reruns the tests. The baseline red reaches the intended assertions: `candidate-test-routing-key-comparator.test.js:117` fails the SQLite BINARY order assertion, with the U+E000/U+10000 pair reversed, and `candidate-test-merge-auto-execution.test.js:104` gets no adjacency candidates instead of the two expected pairs. Both named tests pass with the candidate source in the same job. The fixtures and pass criteria are unchanged between treatments.

Evidence: `evidence/candidate-test-routing-key-comparator.test.js:33-40,98-129`; `evidence/candidate-test-merge-auto-execution.test.js:84-109`; workflow run `36996246393`, job `110803509969`.

## Adversarial JS intrinsics / typed-input edge

- **Blocking — unsupported same-runtime values are coerced instead of refused.** `candidate-src-split-key-comparator.js:172-174` compares any two unsupported values when their `typeof` matches. Two boxed strings have `aType === null`, `bType === null`, and `typeof === "object"`, so this branch calls `String()` on them and returns an order instead of the exact split-key mismatch. That coercion can invoke user-controlled conversion methods or throw an unrelated exception. Non-finite numbers are also unsupported by `resolveSplitKeyType` but `NaN` versus `Infinity` reaches the same fallback. A direct reproduction against the current comparator's corresponding fallback returned `-1` for two boxed strings and `1` for `NaN` versus `Infinity`; the candidate retains this fallback. This violates the typed-input contract and the comparator's no-coercion boundary.
  Evidence: `evidence/candidate-src-split-key-comparator.js:26-37,163-180`; `src/partition/partition-service-constants.js:655-658`.

- **Blocking — consumer witness does not assert the exact typed outcome.** `candidate-test-routing-key-comparator.test.js:32` uses `/type mismatch|mixed|mismatch/iu`, and lines 88-95 use it for the mixed-key assertions. An unrelated exception whose message merely contains “mixed” passes; the assertions therefore do not prove the exact `Split key type mismatch: cannot compare key of type number against split key of type string; mixed-type key spaces are rejected, never coerced` outcome. The probe does compare one primitive number/string error to the exact message (`scripts/checks/partition-key-ordering-owner-completion-v2.js:80-86`), but that does not repair the consumer witness or exercise the unsupported same-runtime case above.
  Evidence: `evidence/candidate-test-routing-key-comparator.test.js:32,88-95`; `src/partition/partition-service-constants.js:655-658`; `scripts/checks/partition-key-ordering-owner-completion-v2.js:80-86`.

The positive UTF-8/BINARY and numeric/TEXT cases pass: `candidate-src-split-key-comparator.js:40-45,136-143,163-180` compares string bytes and preserves number-versus-numeric-TEXT handling; the SQLite-backed test at `candidate-test-routing-key-comparator.test.js:98-129` includes U+E000 and U+10000. Its controlled-negative output in run `36996246393` fails that real SQLite `COLLATE BINARY` assertion on the sealed source and passes it with the candidate.

## Owner convergence

- **Blocking — the sealed structural probe can accept a raw adjacency/order path.** `scripts/checks/partition-key-ordering-owner-completion-v2.js:98-102` only rejects `localeCompare`, a method literally named `comparePartitionKeys`, and absence of any `compareRoutingKeys(` token in each file. It does not bind that owner call to the sort or adjacency expression. An inline raw relational sort/adjacency comparison can therefore remain while an unrelated or dead owner call satisfies the presence check; the structural metric can still reach zero. This means the active Quest's `doneWhen` does not enforce its “no merge-adjacency raw relational partition-key comparator” acceptance term.
  Evidence: `scripts/checks/partition-key-ordering-owner-completion-v2.js:37-39,92-104`; candidate sort `evidence/candidate-src-split-merge-core.js:286-301`; candidate adjacency `evidence/candidate-src-split-merge-evaluation.js:464-498`; acceptance contract `solve/quests/partition-key-ordering-owner-completion-v2/quest.json:3-16`.

The candidate implementations themselves converge on `compareRoutingKeys`: merge sort delegates after the separate table-ID ordering in `candidate-src-split-merge-core.js:42-60,286-301`, and merge adjacency delegates in `candidate-src-split-merge-evaluation.js:490-496`. Current `KeyRange`, `PartitionResolver`, and `QueryGroup` also forward comparisons to that owner (`src/partition/key-range-manager.js:61-63`; `src/query/partition-resolver.js:718-720`; `src/live-query/live-query-group.js:379-381`), with a consumer agreement witness in `candidate-test-routing-key-comparator.test.js:67-85`. No second partition-key comparator was found in the candidate callers.

## Scope

No scope finding. The five payloads are limited to the comparator, split/merge ordering callers, and focused tests. They introduce no persisted-boundary or type-metadata migration and no Raft, transport, formation, membership, or lifecycle change. Numeric boundary precision remains outside this Quest as stated by `solve/epics/release-0-3-queryable-core.md:104-110,169-171`.
