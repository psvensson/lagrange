# Independent C2 orphan-removal implementation review

**Verdict: APPROVE the exact source-subtraction content only. Final receipt, Quest completion, and FreshMG acceptance remain HOLD.** The four-path implementation removes the uncalled promotion/successor island and only its exclusive helper/export vocabulary. I found no production-content blocker in the reviewed bytes. Behavioral candidate proof, the three baseline-red harness repairs, canonical metadata, inherited full-static blockers, and the broader FreshMG physical transition remain open.

This was a read-only source review. I did not edit production, tests, metadata, Quest disposition, or Git state; did not run tests or labs; and did not treat file absence or dependency cleanup as behavioral proof. This report is the only file created by the reviewer.

## Exact review binding

The worktree HEAD and content baseline are `d35d8828c630d1b9675b47f511c477b3cc9ee991`. The sealed Quest remains historically based on `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`; the approved design SHA256 is `d485fe9810816d63bfaeb787b417c532b97a39610b6dd2f3891db4e9418e0d3f`, the independent design-review SHA256 is `25dcf8b28bfc23af77bb61baa8d81c52553064686296b59295947463cc1e0de7`, and the Quest SHA256 is `cf456f1ccc6a96b021e1c3bab8e9c9f0a98ae2c8ab5678e3ed43b27bfb3119f8`.

The canonical source manifest is `source-review-manifest-v1.json`, SHA256 `308e5c95bc5533fa8e1e3cfe8d6239195b8eece58c00d0701562a95ef69261bd`, created at `2026-10-13T13:56:27.117Z`. The complete four-path binary diff SHA256 is `d982b26235430dfbfa92fa594c5d3b9d0b6d849682de5b02e143818f88b6c603`.

| Path | d35 SHA256 | Reviewed candidate SHA256 |
| --- | --- | --- |
| `src/rebalancer/replica-operation-message-group-promotion.js` | `589ff7f6059a20252c6a886aeac018e0c04942573ddc39550ecebb78bb6e4382` | deleted |
| `src/rebalancer/replica-operation-message-group-learner-successor.js` | `0ebebdeafc727b79742c55d05cdec0033da6fcb000b8e65a4a08ad1c2335cda0` | deleted |
| `src/rebalancer/replica-operation-message-group-membership-authorization.js` | `f538d0317409642e4265a53d46fb82c42c6c7465daa8fb7a15833b948c07fa10` | `9f78cfb0f3ef0ef1742661179e21e117381acba9e0038b7f309a8074875cb39f` |
| `src/rebalancer/replica-operation-message-group-membership-permit.js` | `20822a12027a4e375402324ea676496e028b133925e40ef37cf2904b92f918c1` | `a7c2fc03e8fd66e279e77a13c28a1a868cffe18a10f63aaa49714ab23b5e0ab0` |

The authorization hash above is computed from the reviewed file and the canonical manifest. It supersedes the mistyped chat shorthand. Exactly four production paths differ; no test, registry, architecture, script, or generated metadata path is part of this candidate diff.

## Findings and subtraction closure

No source-content defect was found. The proof status remains HOLD for the following material reasons:

1. The candidate has no completed behavioral comparison. Removing the unresolved import is a structural red-to-green transition only.
2. The d35 eleven-suite preservation baseline has 434 assertions with eight files green and three real red harnesses. The branch-authorization fixture, DT6 promotion-proof wrapper, and claim-cache release precondition must be repaired through their current owners and rerun without weakening bounds or assertions.
3. Whole-repository dependency, unused-export, and guideline checks still report inherited/global debt. They are classified below and cannot be called a clean final static gate.
4. Full physical FreshMG CREATE, promotion, serial replacement, seed loss, handoff, source removal, and cleanup are outside this subtraction and remain open.

The deleted 457-line promotion module imports the deleted 227-line learner-successor module. That internal `promotion -> learner-successor` edge is real. The precise closure finding is that the two-module island has no external production, test, script, workflow-installation, package/export, registry, or impact-contract consumer. The promotion module also imports the absent `learner-catch-up-acknowledgement.js`; deletion closes that missing edge without claiming behavior.

The authorization edit removes only the island-exclusive `observeLearnerActionAbsence`, `RECORDED_LEARNER_FACT_COLUMNS`, `recordedLearnerCreateBasis`, and `recordedLearnerOrigin`, corrects island-attribution comments, and de-exports eight helpers that remain live internally: `noteUncertainMembershipWrite`, `actionRecordingInput`, `recordMembershipActionOutcome`, `recordingInvocation`, `recordingSettlementAllowed`, `learnerObservationRefusal`, `learnerWitnessUnavailable`, and `learnerOutcomeQuery`. Their implementations and current callers remain. `recordedLearnerFactIsValid`, the initial learner recorder/recovery, generic branch selection, exact absence classification, and `NONCOMMITTED` remain.

The permit edit removes only the pair-exclusive results `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED`, and `SUCCESSOR_ISSUED`; `inKeyOrder`/`encodeMembershipPermit`; and `MEMBERSHIP_ACTION_PHASES`/`membershipActionPhases`. Current UNKNOWN, UNAVAILABLE, CONFLICT, STALE_OWNER, NONCOMMITTED, debt outcomes, identity/permit/claim codecs, generic PROMOTE/ABORT branch specs, and later-phase vocabulary remain.

Independent searches covered literal paths, direct imports, re-exports, namespace imports, destructured aliases, bracket/computed member access, enum values, object enumeration, registrations, tests, scripts, architecture, and impact contracts. After the edit, there are zero current references to either deleted path or to `selectMessageGroupPromotion`, `recordMessageGroupVoterOutcome`, `recoverMessageGroupVoterOutcome`, `recordedVoterFactIsValid`, `observeLearnerActionAbsence`, `recordedLearnerCreateBasis`, `recordedLearnerOrigin`, `RECORDED_LEARNER_FACT_COLUMNS`, `encodeMembershipPermit`, `membershipActionPhases`, `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED`, `SUCCESSOR_ISSUED`, or their retired string values. `canonicalBootIncarnation` was an internal export from learner-successor used only by promotion; there is no external consumer.

The live native promotion owners are unchanged: `src/raft/learner-promotion-progress.js` SHA256 `523385b21678a0b3dcccaa35e2ad2b19935e1b8f53d474a11a6e45231a3c55c3`, `src/raft/raft-rs-membership-transition-runtime.js` `4f18719c50e631f3bdf9bdfc408dc46b098aa15f538ec4f1cb78c56fdfbe0744`, `src/partition/partition-service-learner-promotion-methods.js` `56e4b1cff94da11e1181d948360c114c0269c5ab31971535fd775b7173320163`, and `src/partition/partition-service-learner-promotion-wake-methods.js` `02f82220212371a0fde8bc9538b3bd8675ae15ad1cea4c528b6f1c4dca0a20d9`.

## Category-complete review

Line anchors below refer to the reviewed candidate unless explicitly described as a baseline/deleted path.

### Admission gating — 7/7

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | Preserved | Permit, row, holder and branch admission remain in `membership-authorization.js:54-214,228-312`, with the current owner claim and native transition modules unchanged. The deletion adds no admission shortcut for branch, initial learner, or native promotion. |
| 2 | Preserved | `membership-permit.js:21-32` retains UNKNOWN, UNAVAILABLE, CONFLICT, STALE_OWNER, NONCOMMITTED and every live debt result. Only the three island-exclusive outcomes disappear. The live absence classifier remains in authorization around `370-440`. |
| 3 | Preserved | No holder TTL, mutation retry, dispatch, proof, clock, or timeout owner changes. The diff contains no numeric budget or scheduling edit. Healthy exhausted bounds remain failures, including the current red harness bounds. |
| 4 | Preserved | The canonical result shape remains `membership-authorization.js:31`; exact identity, permit, claim, configuration and debt fields remain `membership-permit.js:35-54`. The no-reference census found no remaining consumer that could receive an undefined retired member. |
| 5 | Preserved with scope limit | Actual committed voter membership remains a native transition observable in `raft-rs-membership-transition-runtime.js:269-295`. Initial learner recording still records only the learner receipt and does not release full FreshMG debt. This review grants no physical promotion or cleanup acceptance. |
| 6 | Preserved | Initial authorization and recording still re-read authoritative row/boot/claim after awaits (`membership-authorization.js:152-214,489-547`). Native current term/configuration/progress owners are byte-identical. |
| 7 | Preserved | Current comments now identify the initial-only owner and later owners honestly. Exact operation, group, target, holder, origin and generation identities remain in the retained inputs and diagnostics; no island log is redirected to a new owner. |

### Recovery and replay — 5/5

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | Preserved | Full-row conditional basis and readback remain `membership-authorization.js:488-513`; the three recorded receipt columns remain exactly phase, permit and learner stamp at `561-573`. Deleted recorded-CREATE helpers had no live external caller. |
| 2 | Preserved | `operation-workflow-message-group-membership-recovery.js:98-126,182-191` accepts only initial sequence-1 ADD_LEARNER and refuses later phases. Current outcome recovery by operation ID remains `membership-authorization.js:589-606`. |
| 3 | Preserved | Authoritative census distinguishes unavailable from empty at `replica-operation-repository-message-group-membership-methods.js:31-51`. Missing witness/origin cannot grant admission; workflow returns `NO_HOSTED_WITNESS` at `196-200`. |
| 4 | Preserved | Canonical submission, COMMIT-lost-answer readback, exact CAS and replay remain `membership-authorization.js:488-547,575-606`; generic branch CAS remains in the same owner. No new log inference or alternate reconstruction path is added. |
| 5 | Preserved | Live absence classification and NONCOMMITTED remain. UNKNOWN/unavailable/malformed states are not converted into success, and removal of the unused wrapper does not change the classifier it called. |

### Concurrency and serialization — 5/5

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | Preserved | Current live owner claim and durable conditional writes are unchanged; the four-path diff removes no claim, CAS predicate, or row basis. |
| 2 | Preserved | Revalidation after awaits remains at `membership-authorization.js:489-547`; recording samples boot/current row again before settlement. Native proposal-turn validation is in unchanged current owners. |
| 3 | Preserved | Restart, periodic sweep and replicated-row wakes converge on `recoverMessageGroupMembershipDebtOperation` and the existing operation single-flight lane at `operation-workflow-message-group-membership-recovery.js:202-211,229-336`. No orphan method was registered in that funnel. |
| 4 | Preserved | No scheduled timer, wake, retry, or callback refers to the deleted island. Partition promotion wake owners are byte-identical and no new wake point is introduced. |
| 5 | Preserved | Operation, group, transition, source, target and claim identity fields remain exact in `membership-permit.js:35-54,111-146`. Lane construction and owner fencing are unchanged. |

### Owner interaction — 10/10

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | Preserved | `replica-operation-repository-message-group-membership-methods.js:7-85` installs only current learner observation, claim, initial authorization, outcome record/recover, and generic branch owners. Workflow owns initial discovery/reentry; native transition and partition wake own promotion. |
| 2 | Preserved | Exact typed identity/permit/claim decoders and current native grammar remain. No fallback encoder, classifier, execution driver, or compatibility adapter replaces the deleted island. |
| 3 | Proof retained, candidate measurement pending | Existing record/no-effect, branch, native promotion and transport/process-loss witnesses remain byte-identical. Their candidate behavioral execution is still required; file absence and import cleanup are not accepted as this proof. |
| 4 | Preserved | Stale-to-fresh reentry remains in the workflow's authoritative reread and wake funnel (`operation-workflow-message-group-membership-recovery.js:229-336`); deletion adds no cached terminal decision. |
| 5 | Preserved | No retry, backpressure, holder, claim, lease, or single-flight code changes. The diff removes a dormant algorithm rather than transplanting its policy. |
| 6 | Preserved with scope limit | Current services-row and operation-row wakes still enter the live recovery owner. Initial recording does not release full FreshMG debt, and physical source removal remains an open owner obligation. |
| 7 | Preserved | Cache rows remain hints only (`operation-workflow-message-group-membership-recovery.js:229-252,295-326`); authoritative row, native state and CAS decide. Diagnostics do not become authority. |
| 8 | Correct separation | Manifest and binary diff bind the structural subtraction. Behavioral candidate/predecessor evidence must bind exact source bytes separately. Neither a zero-reference scan nor a missing-file negative is treated as current behavior. |
| 9 | Complete closure | Repeated direct, computed, alias, export, value and registration searches found no external consumer of the two-module island and no duplicate implementation. The internal promotion-to-successor edge is explicitly recorded rather than hidden. |
| 10 | Preserved | Current impact contracts name initial learner observation/recording and native promotion owners, not the island. No stale guideline allowance or generated reference to the removed symbols was found. FreshMG criteria and receipts are unchanged. |

### Harness fidelity — 6/6

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | HOLD for candidate behavior | The focused dependency red is structural only. Baseline branch-authorization, DT6 promotion proof, and claim-cache release failures cannot become green by assertion, deletion, or relabeling. |
| 2 | Preserved seams | Existing real native/repository, registered transport, file-backed row-CAS and process-loss seams remain untouched. The proposed harness refit must repair its adapters/preconditions through those same owners. |
| 3 | Preserved | No fixture clock, retry, or timeout changes. A fully spent healthy bound remains a red. No retry-green or bound increase is approved. |
| 4 | Preserved | Exact identity, permit, claim, boot/lifecycle stamp, term/config/progress fields remain in current codecs and fixtures. Pending harness canonicalization is not silently counted as reviewed behavior. |
| 5 | Preserved, nonvacuous proof still required | Positive native promotion, exact row effects, and refused no-effects remain required. The three baseline-red files must engage their actual owner and cannot be dropped or weakened. |
| 6 | Scope explicit | The eleven-suite cone covers named current seams only. It is not physical full FreshMG, off-seed seed-loss, full corpus, power-loss, or final merge proof. |

### Adversarial JavaScript preservation — 8/8

| # | Disposition | Independent evidence |
| --- | --- | --- |
| 1 | Preserved | `membership-permit.js:55-57` retains safe-integer, lower-bound and negative-zero rejection; claim/permit overflow checks remain. No numeric normalization is added. |
| 2 | Preserved | `membership-permit.js:58-70` retains exact own parsed keys before decoding; authorization keeps canonical strict-own action input. No inherited field becomes a grant. |
| 3 | Preserved with unchanged-owner limit | Strict-copy proxy/accessor/exotic rejection remains in the existing utility and authorization ingress. The subtraction introduces no read-before-copy or alternate parser. It does not claim new hardening for unrelated unchanged entry points. |
| 4 | Preserved with unchanged-owner limit | Prototype/intrinsic assumptions are unchanged. No new prototype helper, ambient-method classifier, or duplicate guard is introduced; this review does not expand certification of existing ambient uses. |
| 5 | Preserved | Encoded records still require primitive non-empty strings and the existing byte bound before JSON parsing (`membership-permit.js:55,63-70`). Boxed/nonstring inputs are not coerced into records. |
| 6 | Preserved | Captured strict-own intrinsics and current canonical guards remain unchanged. Removing unused maps/encoder does not add array iteration or mutable-intrinsic decision logic. |
| 7 | Preserved | Exact permit, claim, origin and recorded-fact boundaries remain. No deleted encoder is replaced with a new serialization algorithm; the live committed learner permit/readback stays in authorization. |
| 8 | No new array ingress | The four-path subtraction adds no array reader or validator. Existing native progress/configuration array validation remains with its current owner and is outside this subtraction. |

## Static and proof classification

Independent syntax checks of both retained changed modules, focused ESLint, and `git diff --check` pass. Scoped metrics report zero cyclomatic violations at threshold 12 and zero cognitive violations at threshold 20. Candidate retained files are 631 and 154 lines, below the 800-line source threshold. Impact contracts pass at 62 contracts, 33 coupled pairs, SHA256 `0ab9f9a174dd20a552feceb560b2e9e7388d6d0da69844d36fb57d6f7c8867a0`.

The preserved candidate focused-dependency log reports zero modules/zero dependencies because the requested deleted paths no longer exist. That result is useful only as missing-edge cleanup, not a dependency graph or behavioral proof. A direct reviewer depcruise invocation against deleted path arguments could not open those inputs and is not reported as a pass. The no-reference/caller census supplies the subtraction-closure evidence.

Whole dependency analysis still reports the two preexisting participant-release cycles. Whole unused-export ratchet remains red at 1451 versus 1416; the changed paths are absent from the candidate knip findings, and deletion/de-export cannot introduce a new export. Whole guideline output retains 318 literal, 42 decision-boundary and 3 silent-catch findings from the broader d35 repository; the changed C2 files are not identified as new violations. Ambient-intrinsic and deferred-outcome scoped audits report zero new findings. These facts support source-content approval while leaving final static acceptance on HOLD.

The d35 baseline preservation cohort reported 434 assertions: eight files green and three files red. The proposed `proof-harness-refit-addendum.md` is a plan, not measured candidate evidence. No candidate behavioral test, metadata regeneration, complete corpus, or locked same-host predecessor comparison was performed in this review.

## Approval boundary

The exact four-path source subtraction bound above is approved for content. Approval does not authorize a final receipt or Quest terminal state. Before closure, the owner must preserve the manifest-bound bytes, complete independent harness refits without new owner logic, obtain nonvacuous candidate and same-host predecessor evidence, regenerate canonical metadata, classify inherited static reds, and obtain final independent verification. Open FreshMG acceptance remains unchanged.
