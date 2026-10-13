# Applied-position controls V4 causal design: independent review

Verdict: **REVISE, test design only.** The additive A1 event-loop checkpoint fixes the invalid resolved-sentinel race. S1–S8 and the progress-only/pending-work pair are the right causal coverage. Three bounded clarifications below are required before test implementation; they track the source design correction, not a new protocol or proof weakening. No tests/labs/checkers or source/test/metadata/Quest/Git edits were performed.

Reviewed 2026-10-13 22:02 UTC (2026-10-14 local). Actual file hashes verified before/after: `control-batch-v4-plan.md` SHA256 `47ca5b472bf8dd470cd0e896473089fe0f9b8581406fa4cf4fd490310ac8c088`; additive `control-batch-v4-plan-addendum.md` SHA256 `b22d0028854c7d2c2e5cbbce215145ad3c5eda98b687b6d1414467ffbe3fc823`. Source reference is rejected immutable `bb976f03b1dca9989cfd990af7f188e490ac5243`, not ad23's missing new action. The source correction plan99f1 remains REVISE, with full48 review `test-output/seed-native-startup-census-20261013/applied-position-production-v2/correction-plan-independent-review-v1.md` SHA256 `6e171854072032c25cf924dd433373a535830285a1dc30323aa867f51f829194`. The prior controls full48 review SHA256 `d126da2ef9f5618ad8b2e3a6af2e7fb66fd010bdd0bca70008587fafcffeb5b2` and source full48 SHA256 `7350c29ef69a49da0e16c512d2330ca9ea2814c4a7c6a05b2191db3d9c4c526a` remain incorporated. Original V4's incorrect seam remains historical and is superseded only by A1, not silently erased.

Evidence aliases: P = original V4 plan; A = addendum; F = `test/test-helpers/participant-transaction-fixture.js`; PT = `test/partition/participant-release-protocol.test.js`; RR = `test/node/replica-handler-release-recovery.test.js`; CP = `test/test-helpers/controllable-consensus-port.js`; production R/PA/K/CL/L names are as in the exact source review. Test code pointers bind the current frozen V3 controls only; final implementation must receive its own byte review.

## Complete bounded clarifications

**T1 — fresh coherence and strict capture are separate from valid conflicts.** P30 must distinguish malformed initial/join intent from a coherent different one. Add a fresh-starter mismatch `top deadline != attempt.deadline` expecting INVALID with zero resources. The existing planned top-deadline-only join mutation is also INVALID, not STALE; change both top and attempt deadline coherently for the valid STALE/nonrenewal case. Preserve copied-release-ID invalid body and valid origin/target/attempt conflicts. Include a plain nested release record with a boxed/coercible digest and hostile `toJSON`/primitive conversion counters: zero coercion, immediate INVALID, unchanged starter resources. Exercise actual registered ingress type/action/replica accessors, so capture inside O alone cannot make the test green (L134–143/R125–133 on immutable V1). Use existing strict-own utility and canonical identity owner; no test-side classifier/hash or artificial copied response.

**T2 — C5 must engage the real control owner and actual OBS wire shape.** A24–29 leaves fixture details ambiguous. Reuse the existing PT464–504 SQL_TRANSACTIONS real service setup, actual initial registered CUT_OVER, accepted pre-PAUSE ordinary proposal and durable origin; this is the service's own control table, so a missing external SQL control owner cannot refuse before the intended DRAIN. Do not build a synthetic control success or route authority. A successful direct OBS is the existing fact result (PA101–111), with actual partition/generation/membership/origin/work; it need not contain releaseId/phase, which belong to refusal `releaseAnswer` (K181–184). Pin the request and compare its target/origin to the actual returned facts, require real proposal1/unsettled write and CLOSED at this positive edge. Then call the current full release owner and compare its blocked work to fresh canonical facts, not a duplicate drain predicate.

Close the older-origin/current-term part as well: retain the actual earlier durable origin and use the existing CP term owner transition (`setTerm` at CP273–275, with canonical membership read taking `port.term` at F493–500) before building the new paused attempt. Require actual `originTerm < attempt.term` and the older applied watermark, then OBSERVED while accepted later work remains pending. This is a controllable-port owner boundary proof, not a native election certificate. Do not edit DB origin/status facts or enforce originTerm==attempt.term. Commit the real retained proposal only after the paired assertions, observe the actual write settlement, and require a fresh full release. The case still does not close final-query ordering or physical startup.

**T3 — bind the fault/scheduler/intrinsic controls to the corrected owner grammar.** P27's all-release/reentry test is sound, with these explicit limits: unsubscribe false is already-absent success (native and registry closures return Set.delete), not an injected failure; actual throws retain the sentinel error identities. Retained errors are bounded per acquired resource, observable through the existing handler AggregateError, not an exported map or new cleanup API. Preserve/observe every operation and restore before directory deletion; release/retire the held membership continuation after the prompt-cancellation assertion before an unrelated shutdown wait could hide the causal result. A failed restoration/shutdown retains and reports unsafe directory custody.

Test both a timer and a subscription acquisition that synchronously cancels the observer before returning their real cleanup handle. Require no later acquisition after cancellation and retirement of the handle returned late. A's clock/scheduler owns the stored lifetime and exact clearing even after the handler field is changed to B. Repeated exact joins/cleanup triggers must not create a successor/renewed timer in that same call, and must preserve the original settled answer/Promise.

The Number/Object mutation control P26 concerns the new client/budget guard, not every unchanged K/PA guard. A transparent deliver tap may restore the intrinsics immediately before delegating the exact original request once to the real recipient; count that the actual client reached this seam and the canonical recipient completes. No extra delivery/read, fabricated answer, broad unchanged-owner hardening, or mutated-intrinsic false failure accepted as a new budget proof. Keep malformed direct-recipient controls separate.

## Accepted causal seams and remaining implementation conditions

A7–18 correctly rejects the direct resolved-sentinel race: the public async registered wrappers still have pending Promise continuations after the inner record synchronously resolves. F137's existing setImmediate checkpoint drains those continuations without clock advancement/poll/duration/microtask counting. Preinstall F835's passive track record, trigger registry invalidation, await exactly one checkpoint, assert settlement while the membership gate remains held. For an invalid join install its track at dispatch, likewise checkpoint without releasing the starter. Bind this specifically to the registered route where the new typed answer traverses only Promise continuations; it is not a general scheduler fairness guarantee. Preserve the original operation Promise and observe it under gate retirement: track's rejection message projection is not authority to discard its actual error.

S1's satisfying-current first read must remain exactly one canonical membership read even after an in-flight wake. S5 must test both actual registry replacement and deletion, and late old tail versus the current successor; a successful gate's inner finished Promise alone is not full callback completion. Source inactive-tail/exact-record checks and public successor observations supply the backstop. Native retained-dirty N/K remains a separate witness and dirty-only treatment.

P29's one-case follower generation seam is acceptable as a *controlled boundary* if the existing port's term/configuration/membership/leader identities are coherent and descriptor restoration is exact. Arm it only after initial canonical request capture. Actual canonical PA facts must project N, then R's final current status must project N+1; no fabricated status/fact answer, new production hook, or general fixture decision algorithm. Fix F639's local-leader assumption by consuming canonical facts.leaderReplicaId. The remote leader anchor is a boundary-fixture declaration and does not certify native remote leadership/lifecycle. Exact field layout and read boundary remain subject to final code review.

P43 cannot claim every source-only control is already a measured behavioral falsifier. Base new-action controls on V1 or a narrowly retained-feature treatment, with identical final tests; using old ad23/9ba9 where OBS is absent would be a setup/action red. Source/full treatment and dirty-only treatment have different intended assertions. No healthy full timeout may serve as a desired negative.

## Full48 category incorporation

Every numbered item from the two bound full48 reports remains live. This design has these per-item dispositions; APPROVE means the proposed causal contract, never an executed receipt:

| Items | Disposition/evidence |
| --- | --- |
| Admission1 | REVISE T1 same coherent capture/enforcement; P25/30. |
| Admission2 | REVISE T1 invalid vs coherent STALE; P25/29/30 retain real UNAVAILABLE. |
| Admission3 | APPROVE existing5000ms cap/absolute deadline/no renewal; P26/A9; T3 exact clock owner. |
| Admission4 | REVISE T2 actual OBS facts vs typed refusal envelope; P27/29/A27. |
| Admission5 | REVISE T3 real release/debt cleanup; P27, existing RR137–190 directory custody. |
| Admission6 | APPROVE intended canonical first-read/current-generation and unavailable controls P24/29; exact implementation pending. |
| Admission7 | APPROVE truthful refusal identity P28–30; T2 does not invent fields on positive facts. |
| Retry1 | APPROVE retained wake/one-read distinction P24/29; native proof separate. |
| Retry2 | REVISE T3 stored clock/resource lifetime; P26–27, no new deadline. |
| Retry3 | REVISE T1/T3 exact invalid/stale/unavailable/cleanup outcomes; P25–30. |
| Retry4 | APPROVE A9–16 prompt settlement while read remains held; no circular await or resolved-sentinel fiction. |
| Retry5 | REVISE T3 bounded errors/acquire cancellation/joins; P27. |
| Retry6 | APPROVE late-tail/current-successor control P28 plus carried original budget P30; T3 settled join no renewal. |
| Retry7 | APPROVE existing actual apply/proposal owners, no transport ACK/counter reset; A25–29. |
| Concurrency1 | REVISE T1 fresh/starter/join coherence before resources; P30. |
| Concurrency2 | APPROVE follower final-context/dirty terminal unavailable proposed schedule P29, strictly controlled port ceiling. |
| Concurrency3 | REVISE T3 stored promise survives cleanup; P27/30. |
| Concurrency4 | REVISE T3 timer+subscription reentry/exact scheduler; P27/A9. |
| Concurrency5 | APPROVE actual registry replica/service successor identities P28; no address alias. |
| Formation1 | REVISE T2 actual SQL control/facts/proposal owner, A24–29/PT464–504. |
| Formation2 | APPROVE passive actual wakes only, P24/29; no tick/status repair/poll. |
| Formation3 | APPROVE paired direct OBS fact + full DRAIN/CLOSED control, T2/A27–29. |
| Formation4 | APPROVE unchanged budgets and no timeout-as-negative P43–45; physical proof HOLD. |
| Formation5 | APPROVE no forced core/election/application/ACK/OPEN path P37/A31; controlled CP term transition is not native certification. |
| Harness1 | REVISE T1/T2 right-reason engagement and feature-present negative; P43 cannot use missing OBS action. |
| Harness2 | APPROVE actual service/handler/registered route/current owners P35–39, T2 SQL seam; controlled/native claims separate. |
| Harness3 | APPROVE corrected one checkpoint A7–18 and existing virtual bounds P26; no time advancement to make settlement pass. |
| Harness4 | REVISE T1 coherent input/T2 actual fact fields/P29 coherent follower context. |
| Harness5 | REVISE T2 real admitted origin/accepted proposal1/olderterm/paired refusal/fresh release; no vacuous absent control. |
| Harness6 | HOLD final byte review and locked full selected cone/source pairs/native/query/startup/corpus. |
| Owner1 | APPROVE client budget/PA facts/R request/O scheduling/full cutover authority separation; no duplicated predicate. |
| Owner2 | REVISE T1/T2/T3 exact typed seams and actual cleanup API grammar. |
| Owner3 | APPROVE intended paired invariants P24–30/A24–29, locked falsifiers HOLD. |
| Owner4 | APPROVE current-first-read vs stale-N/fresh-K distinction P24/29; native schedule separate. |
| Owner5 | REVISE T3 bound debt/nonrenewed exact join; budgets preserved P26–27/30. |
| Owner6 | REVISE T3 exact resource retirement and handler AggregateError P27; no alternate driver/store. |
| Owner7 | APPROVE track/counters/checkpoint are projections, canonical facts/classifier decide; A9–11/31. |
| Owner8 | HOLD exact final runtime/test/fixture hashes and same-host source/treatment A/B; planned fingerprints are not measured receipts. |
| Owner9 | APPROVE existing shared gate/request/settle owners, T1 canonical identity/T2 full classifier only; no raw facts/read fallback. |
| Owner10 | APPROVE P31 existing two-form/two-endpoint registry plan, canonical metadata/final cone pending. |
| JS1 | APPROVE revised valid near-MAX positive and invalid numeric domain P26; T1 coherent deadlines; no false derived-overflow claim. |
| JS2 | REVISE T1 actual own mandatory fields at registered ingress; P25/30. |
| JS3 | REVISE T1 top/nested capture and mutation-after-call; P30/R/L source entry, zero hostile calls. |
| JS4 | APPROVE proposed scoped prototype/intrinsic restoration custody; unchanged-owner resilience unclaimed, T3. |
| JS5 | REVISE T1 nested boxed/coercible values, P25 malformed numeric matrix preserved. |
| JS6 | REVISE T3 isolate new captured budget guard; no ambient Array/JSON helper algorithm copied into fixture. |
| JS7 | REVISE T1 coercion counters/type pin before canonical hash, no fixture hash copy. |
| JS8 | N/A new hostile array decoder: tests introduce no peer/census decoding algorithm; actual existing authentic bounded owners unchanged. |

Final-query/control proof ordering and native retained-wake proof remain separate open controls; this plan cannot close either. Root should record T1–T3 in one additive design correction, then request narrow re-vet. No implementation, baseline runtime, final receipts, Quest/main/static/corpus closure is approved here.
