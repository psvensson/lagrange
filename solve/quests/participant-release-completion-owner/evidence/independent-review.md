---
audience: development
documentClass: current
---

# Independent completion-owner review

Reviewer: `subagent:/root/control_source_review`. Read-only source, witness and evidence inspection on 2026-10-21. No tests, production edits, staging or commits performed by this reviewer. Current steering, sealed Quest/design and all six declared verification templates were read. This record is append-only.

## Revised frozen candidate: REVISE before repaired measurement

Reviewed SHA256 identities:

| Path | SHA256 |
| --- | --- |
| src/node/participant-release-client.js | 111ea0cdc5444631d79551ed53a8ea4e08647300a1db787c457e39940ce53f8a |
| src/node/replica-handler-release-recovery.js | 9b1051f820e4a2ffbe55a123b8d01e28fe05a9ff9a85ed5eecacd4cf284e0937 |
| src/bootstrap/bootstrap-service-seed-workflow.js | b1c59e19d615ea176e76a65cd42dff5355e5b44265da78ae73c4c4fa9af4b507 |
| scripts/participant-release-completion-audit.js | 36a6e8601e8b7ac25cd7bcf0cbc99537375747c83ad960d8d061b6d48ac5e4f6 |
| scripts/check-guideline-decision-boundaries.js | d3a58ced71a1bdce68ed29821b2d06dc7f6cfb41708e377fc3e41c5a029b1bbe |
| test/scripts/participant-release-completion-owner.test.js | e7ba19fc9171918847e6b526801ae75611fe29a08042ddd0e1e8a8884156c303 |

The three earlier findings have bounded corrections: the client returns a `completed` decision from its existing CUT_OVER branch and fresh CREATE consumes it without another outcome read; assignment/update/iteration/catch targets are guarded; functions and caller methods are located in their actual top-level/factory scopes, with canonical table and diagnostic imports. No additional product-semantic defect was found in these three frozen production files. Two audit-proof findings remain, identified by source inspection, not an executed mutation:

1. `callerMethodMatches` at audit lines243-249 accepts an object containing the exact method but does not prove that this is the effective returned property. A later spread or computed duplicate key can replace it while preserving the checked method, its body and the completion-call census. Reject spreads/ambiguous computed keys and prove a unique returned property. Add an adversarial control preserving the exact checked method before the overwrite.
2. `bindingCounts` at audit lines264-280 omits default/namespace imports and class identifiers. Adding a default `Object` import, namespace `Number` import, or class named `Number` can replace a guarded intrinsic without modifying the checked body or increasing its current binding count. Count these bindings or conservatively reject unsupported guarded-name binding forms. Add exact-body-preserving controls for all three forms. This is a finite syntax correspondence requirement, not a request for general JavaScript effect analysis.

The author was notified of both findings together and is holding checkpoint/measurement. The current verdict is REVISE for the audit interaction; it does not invalidate the inspected original-source baseline.

## Harness fidelity: all six items

1. Correct failure mechanism: behavior preservation starts from unchanged-source positives, not an invented old runtime defect. Original duplicate-policy audit evidence and rejected-candidate history remain separate. `evidence/getter-baseline/input.json`, `result.json`, `results.jsonl` bind SHA5691a034adcd8b982fbf9c1e9ac1272e06546bdb, adams-gamla, retries0, one fresh test file, seven passing declared cases. No repaired result exists yet.
2. Seam honesty: fresh test lines2-3,64 and76-104 explicitly use a MATERIALIZED admission seam and routed reply seams around the actual authorization-token owner, client and releaseFreshCreate entry. They do not prove production grant or network delivery. Seed tests invoke the existing workflow entry. Existing native protocol/recovery files are proposed composition controls, not substituted by these doubles.
3. Time fidelity: fresh cases170-197 and seed386-433 exercise scripted reads at the two distinct deadline boundaries. Original absolute deadlines and NOT_LEADER constant remain; no runtime budget increase. Scripted clocks prove ordering, not startup latency or unbounded liveness.
4. Field fidelity: fresh assertRequests83-103 binds partition, trigger, original authorization, deadline, route/target and bounded transport options. The final getter case251 onward deliberately uses nonenumerable outcome access to isolate policy reads from failure JSON serialization. Seed diagnostic fields remain first observations, not authority.
5. Non-vacuity: cases require actual deliveries, exact request/answer identities, timer invocation/unref, zero/invalid/safe-too-large delays, prerequisite refusals and wait errors. Getter controls require original two success or three terminal-refusal observations and throw on excess. The new static controls must likewise preserve checked bodies while changing effective dependencies; current findings identify missing controls.
6. Live binding ceiling: original-source getter baseline is a component run. First repaired seven-file composition is pending and cannot establish fresh-seed distributed progress, retained-store admission, U1 or release certification. Original full-startup obligations remain unchanged.

## Owner interaction: all ten items

1. Single question owner: client completeParticipantRelease151-181 alone interprets reply-to-delay completion. Seed/fresh retain initiation, prerequisites and clock execution. Background existing-origin recovery is a distinct operation, not a replacement authority.
2. Typed seam: caller request preserves original partition/build/trigger/authorization/deadline; receiver releaseAnswer remains unchanged. The completion envelope returns exact answer plus locally decided completed/count/projections. It does not grant OPEN or fabricate durable origin.
3. Paired invariant: seed must retain zero-wait preparation at D while fresh must stop there; both permit the final client call after a completed wait reaches D. The paired fresh test170 and seed386 bind these opposite requirements. Repaired measurement remains pending.
4. Stale then fresh: fresh132 and seed404 sequence retryable refusal then actual successful answer through the same client. No cached reply permanently vetoes a new request. This is routed component evidence; actual native recovery remains an unchanged composition control.
5. Pressure/backoff: safe integer/nonnegative delay and original absolute deadline are preserved in client172-179. NOT_LEADER uses the existing constant. Zero delay and a nonadvancing clock have no claimed finite iteration ceiling. Background concurrency/cadence are unchanged.
6. Wake/release: awaited existing sleep resolves into the next canonical client request; rejected sleep escapes. Actual receiver progress/election/application remains receiver-owned. This refactor adds neither a background queue nor a new recovery wake, and does not claim polling as the source of durable correctness.
7. Projection authority: seed alone reads blockedDrain/joinedAttempt in the completion loop, then retains the old failure projection. Fresh hostile diagnostic-getter controls prove no diagnostic reads. The completed boolean is derived only by the existing CUT_OVER branch.
8. Controlled negatives: ten current audit cases mutate AST/source under the real checker, including guard changes and selected-file owner loading. Their rejection is structural evidence, not a native mutant kill. The two additional proof holes above require controls. No mutated runtime branch was run in this review.
9. Escape hatch: product diff removes both caller-local response/delay loops; primitive requestParticipantRelease retains one attempt plus at most one redirect. Nested control/operator and background request paths remain on the primitive. The audit still needs the returned-property and binding corrections before its no-escape proof is accepted.
10. Registry alignment: existing impact-contracts entries named participant-release-bounded-completion include all three product owners, both audit owners and six direct behavior/audit/native witnesses, with completion/initiator endpoints. Final generated metadata, committed identities, exact composition and applicable gates are still required. No receipt is made true by this review.

## Remaining declared categories

Retry/re-drive items1-7: client151-181 supplies the firing path, original frozen deadline, explicit CUT_OVER/refusal exits, no new mutual suppression, unchanged reply-delay policy, receiver-owned duplicate-effect safety, and monotonically increasing local attemptCount without ACK reset. Invalid delays exit before guard-clock reads. Stop reporting stays with the existing seed failure projection/fresh failure form; no new log-volume promise. Zero-delay stationary-clock liveness and general concurrent caller limits are unchanged limitations.

Transport items1-5: askParticipantRelease and requestParticipantRelease are unchanged, including delivery classification, bounded request refusal, actual response processing and one redirect. Completion consumes their answers rather than ACK. No transport waiter cancellation or late-response policy changes. Component reply seams deliberately exclude real network/handler availability; existing participant-release-protocol and release-recovery suites are required in the first composition.

Admission items1-7: seed authority and fresh create-admission token acquisition remain before completion; no origin/cache substitutes. Current transient/terminal answer handling and reason shapes remain. Seed uses its original shared pass deadline; fresh uses its supplied operation deadline. CUT_OVER originates at the receiver; no independent hold release is introduced. Each request re-enters the canonical owner with identical intent. Original refusal IDs/projections remain bound to actual request/answer. Hold latency and full startup progress are unmeasured here.

Concurrency items1-5: no new lock, claim, queue or resource key is introduced. Receiver single-flight/authority fences and background pending/running maps remain unchanged. Existing clock/timer substrates retain their binding and unref behavior. Original primitive await sequence is preserved; adding the async completion frame introduces promise adoption, so arbitrary microtask interleaving equivalence is not claimed. Exact native protocol/recovery composition is required before result approval.

## Measurement boundary

After both audit corrections and exact-byte re-review, a normal checkpoint followed by the proposed seven-file, locked adams-gamla, retries0 run is a suitable first repaired measurement. That is not current approval to run these frozen bytes. Preserve original/rejected attempts, including the explicitly unavailable original support-file byte artifact. Static mutant rejection cannot be relabeled as executed native semantic-negative evidence. No Quest closure, main merge, publisher, integrated-corpus, physical-distributed, U1 or release acceptance is granted.

## Subsequent frozen correction: approved for first repaired measurement

Re-read the corrected support and adversarial tests after the preceding REVISE. Support SHA256 is now `5e8fb0dba8f58bb912d99e1ba1700ce9baa8bdb3e1a5ec3399c8b324a296cb5d`; adversarial test SHA256 is `f3d76c26f066e4f31f37c4a749ea1417be5ddbbc84691fcecb85b6c4f15a808f`. The three product hashes and main-checker hash in the preceding table are unchanged and were rechecked. Fresh getter-test hash remains `8c4e7706eea5c794794075f4f585800c0569878caa7498733718f58784880355`.

`directUniqueProperties` now requires every returned object entry to be a direct noncomputed identifier property with a unique key. This excludes spread replacement, computed ambiguity, duplicate data keys and getter overrides of the checked method. The new returned-method control preserves the original exact method and inserts each overwrite form after it. Binding census now counts named/default/namespace imports and class declaration/expression identifiers; four new controls preserve checked bodies while introducing these bindings. These changes address both prior findings without widening the loop allowance, changing production semantics or relaxing a baseline. The earlier support/test revision is retained in `evidence/review-refinement-2` according to the author; this record does not claim the unavailable first support bytes were recovered.

All six-category conclusions above remain applicable, with the two audit blockers now resolved by source correspondence. The adversarial file has twelve declared cases; their execution is still pending. **Approve these exact bytes for normal WIP checkpoint and the first seven-file repaired measurement on the proposed locked host with retries disabled.** This is code/design and measurement approval only. A normal-hook failure must be retained and honestly handled by its existing owner, never represented as a passed gate.

Remaining acceptance evidence includes exact committed source/test identities, executed positive and structural-negative results, unchanged native protocol/recovery composition, complete audit identity-delta disposition and applicable Quest/change-proof gates. The original-source getter ledger is a baseline, not repaired evidence. A static source mutation refused by the checked-body guard remains static evidence; no native semantic-mutant execution is claimed. No current receipt or terminal status is approved by this measurement authorization.

## Exact checkpoint result and full raw identity disposition

Independently inspected checkpoint `90fb37194121ea793197d26e845c2d38a9c9efc0`, the completed controller output and input/result/ledger in `evidence/repaired-90fb37194` (original local copies under `test-output/participant-release-completion-owner/repaired-90fb37194`). The controller identifies that exact placement head on adams-gamla with retry0; its final result is seven files passed, zero failed, 164 runner-reported assertions/cases. Each expected file occurs exactly once in the ledger with attempt1, ok=true and retriedOnce=false:

| Witness | Runner count |
| --- | --- |
| fresh-create completion | 7 |
| seed failure projection/completion | 7 |
| seed once-per-cohort | 1 |
| completion-owner adversarial audit | 12 |
| existing decision-boundary audit | 96 |
| existing handler release recovery | 25 |
| existing participant-release protocol | 16 |

The supplied plan lists ordinary jobs4; controller execution honestly records ordinary jobs3 after its lane cap, and bootstrap jobs2. This is not a serial/native-cross-host claim. The controller and ledger support the same seven-file outcome, not 164 independently enumerated JavaScript assert calls.

The eight source/test entries in `revised-source-manifest-2.json` were compared against actual Git blobs at90fb and all SHA256 values matched the approved review bytes. The four existing regression files (cohort, recovery, protocol and decision-boundary tests) are byte-identical to original-source getter checkpoint5691a034adcd8b982fbf9c1e9ac1272e06546bdb. The fresh getter witness remains unchanged from its measured original-source baseline. No evidence was inferred from later documentation heads.

Independently recomputed every identity/count from the two full raw violation arrays, using the canonical identity tuple defined by `buildDecisionBoundaryViolationIdentity` (filePath, functionName, kind; absent array fields encode null). The stored count maps matched those recomputations. Baseline:2260 scanned files,791 raw findings,664 identities. Candidate:2261 files,789 findings,662 identities. Exactly two identities decrease1 to0: seed createBootstrapServiceSeedWorkflowMethods/local_retry_loop and fresh createParticipantReleaseRecovery/local_retry_loop. There are no added or increased identities, and no other count changes. Total local_retry_loop findings41 to39; mixed_cache_and_sql_decision302 to302. This is evidence of the intended bounded consolidation and checked-loop classification, not a clean repository audit. Other findings and the separately owned SQL audit remain distinct obligations.

Verified raw artifact hashes:

| Artifact | SHA256 |
| --- | --- |
| before-full-decision.json | d7a8cba7bc7e664d0859182800b91eacf661df8b298c06c496756561c4ba5cc5 |
| after-full-decision.json | 99b666e521da131dba1e868744a41f29c32f9a4c75c19764a18682aed3d36fda |
| repaired input.json | f4c09d31db5f28cddd65770212af3afa58d644a8e12036a4aa21ba66f8682d33 |
| repaired result.json | cbf3b02afff1dd04604e1233c0bf2fde9565dec98283dd0ac2e8d1e394e32715 |
| repaired results.jsonl | 5e9ebe2fd3be13e9411f042cc1c2818c08e5d32a3cf6de7a010ae8735f1387b8 |
| repaired controller.log | dbf5dcdc63e17d06dc4aea756a2e204dc162bd7fc8742ea929fa8c709b86c081 |

**Bounded result verdict: approve the measured behavior-preserving completion consolidation and its structural audit controls at90fb for integration into the next reviewed candidate.** The original outcome-getter, deadline-order, authority-identity, seed projection and existing native protocol/recovery controls pass together on that head. This is not proof of original fresh-seed startup progress or automatic retained-store admission. The twelve source-mutating audit cases execute static rejection controls; they are not native semantic-mutant runs. In particular, the separate native A retry-suppression obligation is neither implemented nor discharged by this lane.

No receipt was edited by the reviewer. Final combined root candidate composition, canonical change-proof, applicable independent/Quest gates and any broader corpus/physical evidence remain pending under their owners. The historical 789 remaining raw findings are retained obligations, without a claim that all must be repaired by this bounded unit or a waiver of any applicable gate. A later evidence-only containing commit may preserve these exact measurements; it must not be named as a newly measured runtime head.
