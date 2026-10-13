# Independent correction verdict — V2 missing legacy consumers

**REVISE exact source V2, including the prior bounded content-suitability verdict. Whole-Quest acceptance remains WITHHELD.** The31-path deletion missed live consumers outside its manifest. Their source and fixture references become undefined after the constant producer is removed. The correction is necessary dependent cleanup within the already authorized deletion unit, not unrelated baseline debt or permission to restore compatibility. Historical approval/review reports are retained unchanged; this new evidence supersedes their current verdict until a complete expanded correction receives independent verification.

Read-only review. No source, tests, registry or Git edits, test execution or commit were made by this reviewer. C2 review/implementation remains paused while this TX1 dependency correction is resolved.

## Exact reviewed inputs and evidence

- Candidate immutable broad-lab input: `775504a9792b7b2f21b1cc6d92406c8d1df26d97`.
- Identical-test predecessor-source control: `7d5ccc89125fa657db5ddc4877dff5e1f57e76a3`.
- Source predecessor: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`.
- Current reviewed source manifest V2: `solve/quests/tx1-single-path-alpha/evidence/source-review-manifest-v2.json`, SHA256 `837d5131e13d81bdcdf8812068fa21ca87a053a0079b2584f37ba96e6e7487dc`.

Git object comparison verifies the two lab inputs differ only by the31 production paths; control `src/` exactly matches e6. Control placement inputs identify `carinas-windows` for the session-binding retry file and `adams-gamla` for the generic control-plane retry file (`test-output/alpha-single-path-20261013/red-controls/*/input.json`). Root reports the same-host controls isolated this missing-consumer defect. Independently read candidate broad raw log `frozen-v3-change-lab.log:5831-5900,6324-6385`: the two intended retry assertions fail immediately, at test:143/1168, about39/25ms; these are behavioral failures, not timeout/import/setup failures. Their exact source mechanism is confirmed below. No uninspected per-host final pass count is claimed by this report.

## Complete findings found so far

1. **Three live undefined constant consumers.** `PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE` was removed from `partition-service-constants.js`, but remains in:
   - `src/query/query-executor-write-retry-routing.js:580-582` inside old `shouldRetryTransactionActiveWriteOnSameAddress`;
   - `src/rebalancer/replica-operation-repository.js:352-354`, a one-element exact error-message list;
   - `src/rebalancer/replica-operation-repository-mutation-gateway-methods.js:514-518`, the old contention predicate.
   The query predicate coerces the absent value as a search argument; test doubles return absent error. Repository exact-message/rotation/jitter logic likewise consumes an absent producer. An undefined guard or restoration of the old constant would leave an obsolete competing interpretation.
2. **Connected old-only routing execution state.** The old query predicate is the sole producer of `CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS` (`write-retry-routing:506-517`). Its two decision consumers remain in `query-executor-partition-delivery.js:335-340,530-536`, and vocabulary in `query-executor-shared.js:164-168`. Remove these together. **Do retain** `candidateState.requestRetryCurrentAddress`: it has current unknown-outcome callers at partition-delivery:514/569 independent of the retired decision kind; deleting the generic primitive would break current idempotent delivery behavior.
3. **Connected old-only repository rotation/jitter.** `isOperationMutationPartitionContention` feeds implicit-session rotation OR:578-579 and retry-delay jitter:606-618. Remove those exclusive arms and the old list/import/shared exports. Current route-repair rotation (`isOperationMutationRouteRepairCandidate:532-564`), explicit-session retention:567-575, canonical typed retry classification:384-390, existing mutation ingress, and retry-after/local/enclosing deadline budgets must survive. The repository's `this.random` currently has only the old jitter consumer:615 and constructor:506; delete exclusive residue only after the complete caller census.
4. **Canonical classifier still recognizes retired text.** `src/control-plane/control-plane-error-classification.js:37` hardcodes `Transaction already active on this partition` in retry fragments. This is an additional live semantic consumer missed by a property-key-only census. Remove this old-only interpretation from the existing canonical classifier, preserving every current typed/code/text contract; do not add a local replacement predicate in either caller.
5. **Tests must be retired or refit by their actual claim.** Query session-contention test:44-149 is specifically old-only same-address retry and must not be preserved by inventing a current local session engine. Generic control-plane retry test:1075-1174 retains a current routing invariant and must use a real current typed retry outcome with meaningful two-delivery/success checks. Repository tail tests:820-869 and914-955 contain old-specific contention jitter/rotation claims; classify exclusive portions, retaining current explicit-session and route-repair contracts in current witnesses. Budget tests:1043-1107,1110-1163 must keep their unchanged enclosing/local expiry assertions and original-result identity under a real current typed retry failure; absent error equality cannot count.
6. **Literal current-attribution residue.** Public facade test `public-application-database-transaction-facade.integration.test.js:55-56,214-245` hardcodes the same old phrase and attributes it to current staging. Current request owner returns `CODE.ALREADY_ACTIVE` (`partition-participant-transaction-request.js:308`; constants:71). This witness needs an explicit owner-based classification rather than retaining an invented current message or dropping required current concurrency/conflict coverage. Its broad embedded expectations are not certified by source inspection; calibrate only through the actual current owner/public seam.

These findings were sent directly to the cleanup agent. The writer is conducting a complete removed-constant/method audit. This report does **not** yet claim that every removed member/alias/literal is closed: the correction must include property aliases, destructuring, shared exports, bare values, fixtures and script ingress, not just literal module imports. SQL/public BEGIN/COMMIT/ROLLBACK homonyms and deliberate unknown-retired-command negatives must be classified rather than deleted.

## Required correction constraints and proof

Delete retired arms end-to-end. Add no old constant, fallback, compatibility adapter, duplicated refusal/retry predicate or substitution of current TX1 identity with routing-session context. Current retryability stays owned by `isRetryableControlPlaneError` and current partition typed outcomes; current route repair/unknown-outcome identity stays with existing owners. A sessionId routing context alone remains ordinary, and explicit routing/session contracts remain intact where independently owned.

Preserve all current budgets and reason/error metadata; no raised timeout or retry count. Keep current typed refusal consumer handling, defer/retry-after, explicit-session retention, route-shaped implicit session rotation, unknown-outcome same entryId and generic same-address actuation, pressure/backoff and shutdown semantics. Do not require old contention jitter after its sole producer is gone or replace it with new random policy unrelated to the retained owner contract.

Required before a renewed source verdict: exact expanded source/test manifest and no-reference closure for every removed public member/method/value; actual byte inspection of all routing/repository/classifier/fixture deltas; meaningful current typed retry/rotation/budget and unknown-outcome controls; fresh static/graph/registry checks; locked candidate/predecessor classification at the new exact input. Historical V2 source, A/B and broad evidence cannot be reused as final acceptance for changed production bytes.

## Seven-category impact

| Category | Current verdict / obligation |
| --- | --- |
| admission-gating | REVISE transient-consumer handling and reason shape: removed producer leaves undefined rejection data/classification. Preserve canonical typed admission and unchanged retry budgets. |
| recovery-replay | REVISE consumer closure. Preserve generic unknown-outcome retry with same entry identity and current durable result; no fallback success. |
| sweep-timer | REVISE retry/backoff residue, not service hold cadence. Retain local/enclosing retry deadline controls and shutdown; no budget increase. |
| concurrency-serialization | REVISE old-specific same-address/contention branches. Retain current pinned explicit routing context, route repair and generic unknown-outcome actuation; no new winner/driver. |
| owner-interaction | REVISE. Deletion must update all actual consumers and canonical classifier as one interaction, then registry/import graph/exact witnesses. Earlier31-path approval failed to close outside-manifest consumers. |
| harness-fidelity | REVISE undefined old doubles and stale literal witness. Current generic behavior needs actual typed failures, nonvacuous deliveries and unchanged budget assertions. Immediate candidate reds are meaningful and cannot be labelled inherited setup debt. |
| adversarial-js-intrinsics | REVISE coercive absent-value consumption; correction must delete the obsolete branch rather than coerce/default it. Current strict ingress/identity algorithms remain unchanged; no new ambient-intrinsic classifier. |

Existing V5 deferred-election19/20 primary recovery red, historical W1 unknown-phase healthy timeout, M1/C2 and broad/static owner findings remain open and separate; they do not justify a child defect waiver. Non-main preservation of a known red tree may retain evidence, but this verifier's prior bounded source/content APPROVE is withdrawn for current V2 until the concrete correction is independently verified. Whole-Quest/main/publish acceptance remains withheld.

## Current consumer byte fingerprints

```text
query-executor-write-retry-routing.js ff43ad438ee38d4c1bfa19bfddb18336587a4ca510699f86cd143ee6714d754c
query-executor-partition-delivery.js 66eb2497ca11c37df2f4665533972c85ee933e97addc9f745b0f08576d6decc3
query-executor-shared.js 3199ab1015a82e211be0a2415f088390533e2717433282d78d1a25932afc57b4
replica-operation-repository.js 5670de94cb90ab97ae5fd132e0aae229ce94ef9012387d0af9fdfc46003c8ec2
replica-operation-repository-mutation-gateway-methods.js 5deb3d1dca320f6891569cf92b9bbbe11a229afa40629390a61efaedf856ca7c
```

Current coordinates and fingerprints were read before the implementing correction; final replacement hashes must receive a new review. This is an additive rejection, not a rewrite of historical verdicts.
