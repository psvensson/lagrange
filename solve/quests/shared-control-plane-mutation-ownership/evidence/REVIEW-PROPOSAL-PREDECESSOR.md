# Shared mutation proposal and predecessor — independent preservation review

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25.

## Verdict and exact scope

**APPROVE preservation of this unsealed proposal and the first predecessor witness.** The witness is suitable source for the declared first measurement. This verdict is not production implementation approval, a measured predecessor result, a Quest seal, runtime acceptance, or permission to compose the intentionally failing witness into the integration candidate.

The baseline is `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7`. The independent binding in `proposal-review-source-binding.json` verifies all eight files in the author's frozen proposal binding, all twelve predecessor-manifest entries, and the ten unchanged runtime/dependency entries against that exact baseline. Additional source paths supporting this review are bound there as well. The only executable additions are the new test and its declaration for the existing evidence harness. No production or test source was edited by this reviewer, and no product, native, or tooling regression was run.

Author binding SHA-256: `e08fac0a815f14ad2e9fd9b2c255c8047fb3a62f6c55817be8238f8736d2c1e2`.

- Witness: `b7dcaefab016e631aabb0c53eee48ef88cb5302565b40b539875bdfc58159eb9`.
- Harness declaration: `cfacea485c4f3ea398c7f75468ea22ca59e8cf862e195edfc3489d325b094be9`.
- DESIGN: `6b005c904ff76c1febe975778efaa78b211aadb40c5ef8527db537e2a44ceb7c`.
- OWNER-CENSUS: `b3fcdedd4c215d15d8b13247b4a6b8c2f6617854f9b01a63c7bcd75bbdd34f4f`.
- PROOF-PACKET: `c7c20f2b5941a942be203f842509d4a277e0d63ade08ba08f67806bb28bbabc0`.

## Consolidated contract review

| Concern | Source and reviewed disposition | Verdict for this proposal |
| --- | --- | --- |
| Unconfirmed application and retry authority | The sole classifier gains UNCONFIRMED with applied/accepted/deferred false. Retryable means continuation by the existing owner, not new admission, replacement content, a new identity, or another retry loop. Missing fields cannot fabricate rejection or known noncommit either. Earlier uncertainty survives a later refusal. | Coherent. Implementing callers must consume these facts rather than infer permission from contractState, success, or retryable. |
| Positive row effect, statement settlement and replay | `partition-committed-statement-outcome.js` retains committed zero and named unknown-count replay. The proposal keeps zero distinct, preserves count absence, and requires exact-one or authoritative exact-row evidence at semantic consumers. | Coherent. An unknown-count replay can settle the original statement without proving that an exact row predicate matched. |
| Named instance custody | `control-plane-write-identity.js` currently releases nonthrown success-not-false answers and can label a prior instance APPLIED on that basis. The revised settlement table separates positive, unknown-count replay, zero, committed failure, no-op/preproposal refusal, and unresolved/provisional cases. It carries the original immutable result and identity. | Required migration is explicit. Preserve legitimate `pendingAppliedSettles` birth/adoption behavior while requiring exact identity readback for unknown count. No new key may resolve the old uncertain entry. |
| Provisional transactions | `partition-participant-transaction-staging.js` returns success/provisional/physical changes before durable COMMIT. Revised design explicitly keeps that capability provisional and denies a committed control-plane application grant from the count alone. | Correct boundary. Transaction staging and committed operation-result reconstruction must remain separate during the producer change. |
| Visibility and progress | Helper pending/persisted state, cache observation, and authoritative readback are different facts. The proposal removes missing/skip/bootstrap defaults to visible and preserves original-seed exact committed readback. | Coherent. Write-identity settlement does not discharge the caller's observation debt. |
| Earliest seed and join capability | Bootstrap CDC currently falls back from Raft failure to local SQL and discards routing options. The proposal reuses the admitted original partition's Raft owner, one key/entry derivation, per-cohort leadership admission, terminal/current-role gates, and original preparation custody. Join retains work under its existing publication owner. | Supported direction. A bootstrap flag/map cannot grant original rights. Removal of alternatives must preserve actual later completion under finite failures, not merely demonstrate refusal. |
| Consumer completeness | The 72-file literal census is expressly a source index, not a complete call graph. OWNER-CENSUS adds semantic wrappers, exact-row consumers, count projections, identity settlement, provisional results, and physical uses that must remain physical. | Appropriate migration map for preservation. Final signature/capability decisions and caller proof remain required before production edits. |

No new preservation blocker remains from this pass. The revised documents resolve the initial review's ambiguity about named settlement, provisional application, fixed-key witness scope, and original output collection. These were raised before any production edit; they are not measured runtime findings or a claim that the implementation has already changed.

### Public count projection remains an explicit production decision

The review traced an indirect consumer beyond the literal census: `src/query/application-database-result.js:projectAffectedRows` currently turns absent count into zero. Its shared count reader keeps absence distinct; `src/runtime/pgwire-result-mapper.js` already refuses missing DML counts. The revised proposal now names `affectedRows:null` for named applied DML replay with unknown count, typed invalid-result handling for malformed DML, and unchanged read/DDL presentation through the existing statement-kind owner. It preserves known application rather than reclassifying count unavailability as uncertain application.

That is a reviewable proposed public contract, not an approved implementation or complete caller migration. The public facade/PG-wire callers and their representation contracts must be traced and proved with the producer change. This review does not claim a newly executed reproduction through either public surface.

### Remaining source decisions already inside the proposal

Before changing the producer signature, resolve the census's explicit `SYSTEM_TABLE_WRITE` capability question through the actual construction/registry paths; a missing literal sender alone does not justify removal. Trace speculative/straggler write reachability and preserve replay evidence at every reached result projection. Preserve physical SQLite counts used by durable outcome storage, D2 owed-work recording, mirror planning and lifecycle transactions; a field-name match is not a legacy contract. Recheck the incoming reviewed ADMIN consumers against the same canonical count/visibility semantics when composing this future repair.

These are completion items for the existing proposed interaction, not extra review stages or permission to widen into unrelated work.

## Predecessor witness and harness fidelity

The two cases exercise the real AuthoritativeRowMutationHelper and ControlPlaneSystemTableGateway, with only the CDC answer and supported clock/timer seams controlled. Each first flush must actually reach CDC. The assertions then demand unconfirmed application, retained pending intent, no persistence or visibility claim, and one bounded scheduled continuation. The second flush uses the same pending state without requeueing/restoring it and must actually reach CDC again before completing from a controlled exact-one visible result. Every observed delivery checks the same table, guard, payload and caller-owned key.

This is a useful paired discriminator: premature pending clear prevents the later real producer call rather than being hidden by rebuilding the fixture. Source predicts the predecessor will publish false progress and lose that second engagement. Only the actual classified runner can establish that these are the reached failures; import/setup/dependency failure would not measure this defect.

The fixed explicit idempotencyKey intentionally takes `runControlPlaneWrite`'s forwarding path. It does not exercise `judgeAttempt`, `resolvePendingInstance`, or `pendingAppliedSettles`. The final proposal states this clearly and now has eight required receipt IDs, including separate named-custody and provisional-transaction obligations. This declaration generates only the first receipt. Its manually reentered second flush and captured timer prove neither elapsed-time recovery nor real Raft commit, physical failures, seed startup, or storage equality.

The existing harness captures child stdout; outer logs alone are insufficient. PROOF-PACKET now names the original runner TAP, matching stderr, test-results ledger, receipt and full outer log. Preserve those bytes and the first failure from the same run, along with exact committed source, executed count, terminal state and cleanup. No rerun, constructed receipt, old passing result or missing receipt ID can substitute for the measurement.

## Acceptance boundary

Safety is proposed through retained uncertainty, exact identity/effect evidence, separate visibility and no alternate mutation path. Recovery progress still requires the later positive and declared seed/join/owner continuations on a real candidate. Resource bounds retain the existing held-instance, admission and timer owners; the first source witness does not certify endurance or physical scope closure.

Normal-hook preservation of this unsealed branch is appropriate. Production contract approval, measured red evidence, sealing, implementation, all eight final receipts, independent final source review and safe composition remain outstanding under the existing Quest and lab owners.
