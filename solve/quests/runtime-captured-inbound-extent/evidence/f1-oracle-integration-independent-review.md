# Independent integration evidence review: F1 same-host pair

Reviewer: subagent:/root/native_witness_verifier. Artifact inspection only; no test execution, lab action, source change or Git mutation. This supplements the preserved category-complete fixture reviews, candidate trace review and three controlled-negative review. It does not replace them.

**Verdict: ACCEPT the pair and its regression classification as evidence; HOLD the whole increment.** The candidate implements its new finite-capture design, but the unchanged native F1 oracle now demonstrates a regression against the existing late-arrival contract. This is not evidence of a false committed-write acknowledgment or a Raft safety violation. Evidence preservation on a review branch is justified; merge, terminal Quest landing and release activation are not.

## Exact pair and custody

Both original executions used lenovo-laptop, boot ID `18581133-d0d9-4dec-a3f8-266562235699`, Node v22.23.2, the same installed dependency graph `0b49533effbed7e3577dd212628a99e56c630068f76a9dc148cfc8dc96b28bf0`, planner jobs=4 and ordinary lane. Requests specify retry=0 and no inherited TAP_TIMEOUT override; placement logs record factor=2.2, retry=0 and the exact requested commit. Neither discovery is a current machine lease.

| Side | Exact commit | Runtime SHA256 | Whole-file result |
| --- | --- | --- | --- |
| Candidate | `4aa8780cfec6f2718b86b4d1e27ee9711492be59` | `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f` | exit 1; 155 tests, 152 pass, 3 fail; 120595 ms classified |
| Predecessor runtime only | `19de88997fda4b6719bc0c1e46df61698bac1922` | `a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b` | exit 0; 155 tests pass; 110523 ms classified |

Independent Git reads confirm that the only behavior-bearing difference between these commits is `src/raft/raft-rs-runtime-owner.js`; the other two changed paths are the generated owner inventory and import-graph seal. The oracle, harness, cells, driver, package lock and execution APIs are byte-identical at both commits. This comparison isolates the reviewed runtime increment, not each changed line individually.

| Shared input | SHA256 |
| --- | --- |
| transfer-leadership-drain-oracle.test.js | `fe5776a91c0fc706d14bd4c30e74316eadf1c15bef3bb5db12c657cd54341007` |
| transfer-leadership-drain-oracle-harness.js | `d958868591008aace41944d8de0704fda55edc8995c1ced4cb4fba4fedae2687` |
| transfer-leadership-drain-oracle-cells.js | `2bbaa9254e24e8adb6f56f07ef0d7ddf4916c03d6fbf831d301e0da732d52056` |
| transfer-leadership-driver.js | `30a72135910db844b99474d6069fd26938f7a36fbe58ac2fe753f639fa583a13` |
| package-lock.json | `8fb1a612db45cac0a61e281b41fd60da315f916b7aeb52046bcbe3e7b8d61ecd` |

Raw candidate TAP SHA256 `5c80b33c1ee8f70a08a515551fe2f77c302c84a8375790d5fb9cf5d1b65f1d3f` is exactly contained in the candidate log after removing its host prefix. Raw predecessor TAP SHA256 `c0f87ede3743a8ec98a1ff1d216c05fe07254a94174f86b545a7d62257a596eb` reports the same 155-pass count and 110523 ms as its successful classified log; successful logs do not echo full TAP. Its raw TAP was collected by the existing capture controller, not by another execution. Controller SHA256: `b960e23e0648029e06fb114e033ae65a25ab465cf8cb901fb7f4d0c89cff6a5c`.

The derived `f1-oracle-integration-independent-summary.json`, SHA256 `6a8b6a6731beabd753a912ebf80fb2f820f8692962016540ab4de4944f4094c5`, records hashes of every pair artifact, exact source/API identities, placement consistency, dependency identity and all focused-file counts. Requests, plans, discovery, summaries, exit-code files, raw TAP and logs agree. The earlier TV failure remains the first candidate observation; the later same-host pair is a causal comparison, not retry until green.

## Reached semantic failures

All three candidate failures are `ERR_ASSERTION` at `transfer-leadership-drain-oracle.test.js:252`, after `assertNotVacuous` at :251. No import, setup, missing symbol, timeout or cleanup failure substitutes for the result.

| Cell | Candidate pending answer | Same candidate processed-first reference |
| --- | --- | --- |
| mid-turn-D1, named transfer | CORE_OK / transfer-requested | CORE_REFUSED / no-known-leader; phase leadership-transfer; retryable=true; recoveryRequired=false |
| mid-turn-D2, most-caught-up transfer | CORE_OK / transfer-requested | CORE_REFUSED / not-leader; phase leadership-transfer; retryable=false; recoveryRequired=false |
| mid-turn-D3, proposal classification | CORE_OK / drained | CORE_REFUSED / propose: raft: proposal dropped; phase propose; retryable=false; recoveryRequired=false |

The predecessor TAP reports all three cells passing, including the assertions after answer equality; it does not print its exact answer vectors. Do not substitute the candidate reference's printed values for unprinted predecessor values.

The conflict is explicit in preserved authority: `solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/coverage-model.md:165` requires messages arriving during an await before the decision to drain first. The amendment :7-16 retains that claim and :70-72 specifies the pre-decision requirement. Their SHA256 values are respectively `f0049c4d700e3dd1d34be2380e9d9630b3eb70e68c51996cc55ae294176113be` and `6df59e5dfb767cb36ecc63653809af5c72a663fff8e2474cf7583c17ac03437b`. New `solve/quests/runtime-captured-inbound-extent/DESIGN.md:9`, SHA256 `1a122e71d184efba30e857d61a1ad0b23f5c06a4c2a85da5aeaf032d1675232f`, excludes later arrivals after admitted capture. The existing runtime owner must explicitly reconcile these incompatible cuts and each operation's response promise.

The preserved source auditor addendum SHA256 `bdcb9773baa62654707b4982ce61f80331aa24bbd8ccdc669feddfa650258803` correctly held whole-increment certification. It predates this pair and makes no claim to have reviewed it; this receipt supplies that missing evidence without rewriting the addendum.

## Evidence limits and category extension

- Harness fidelity: real ports/core/Ready execute; the higher-term transfer-election RequestVote is faithfully crafted by cells:658-663 and harness:465-475. It is not a recorded core-produced envelope. W07's actual produced-envelope evidence remains separate. The pending initial extent can contain multiple AppendResponses; no one-envelope assumption is justified here.
- Concurrency and transport: source establishes capture/await/late enqueue/command order. Raw TAP establishes answer divergence. It does not record the precise relative order of Promise settlement, the consumer observing that answer and later owned turns. D1/D2 transfer acceptance is distinct from leadership transfer completion (runtime:1560-1586); D3 CORE_OK/drained is distinct from committed application (runtime:1686-1693).
- Recovery and application: runCell computes outbound, observations, streams, durable rows and restart data before returning (:567-588). The candidate then fails at answer equality, before comparing them at test:258-270. Those vectors are not emitted. Their existence in memory is not preserved proof of their values, equality or divergence. The three-event companion review states the gap explicitly.
- Sweep/timer and wake: the historical driver uses a never-advanced virtual clock (:6-15), explicit status-driven delivery and later rounds. F1 is not an autonomous remainder-progress witness. W07 and C2 remain the separate custody/wake evidence.
- Owner interaction and admission: one existing runtime command-turn owner owns this temporal decision. No new authority, fallback, live-drain restoration or altered admission budget is authorized by this review. Previously reviewed generation, refusal and persistence controls remain valid bounded evidence; they do not resolve F1.

The focused totals independently recomputed from raw TAP are 11 candidate files / 56 passing tests / zero failures: 8 new/frozen controls plus 17 turn, 18 Ready/persistence and 13 recovery tests. The preserved three source-only semantic negatives remain valid. These are separate locked-host groups, not a physical multi-host Raft certification. Broader cone results remain incomplete and other REDs unclassified here; no inherited classification follows merely from unchanged test bytes.

## Draft report review

Initial REVIEW-REPORT.md SHA256 `f70966e8de292408136ee8c7a16ec3253c7a00b3b0a01c5cb2a47c76b5200498` omitted the completed same-host pair. The inspected updated draft SHA256 `b564ac3e3cdfd0ab3f0f2d2bb491fa04dc6708c5a30b459eeef51e826a75f56f` adds the pair and correctly calls it a new historical-contract regression. The no-false-commit/safety qualification and whole-increment HOLD are supported.

Two preservation qualifications remain: label the wider cone receipt provisional/current until the final completed/failed/unexecuted counts freeze; and label the minimal F1 schedule as source-reconstructed. Do not imply that F1's late-vote handling proves no-rescue remainder service, numeric term/configuration/durable equality, a specific outbound trace, or caller-visible response order. The independently reviewed source, first failures and historical evidence must remain immutable. Any subsequent report revision needs its own content-bound hash receipt; this review does not preapprove unknown bytes.

**Stop:** preserve evidence and retain whole-increment HOLD. The complete release successor stays unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, and PR #122 plus the rejected release model remain rejected.
