# Exact election evidence, same-turn owner — abstract protocol ↔ runtime

Model: `ExactElectionEvidenceSameTurn.tla`.
Quest: `movielens-exact-election-evidence-same-turn-model`.

This focused model composes target-election dispatch, response evidence,
continuation routing, retry expiry and alternate-target selection, canonical
remove-safety evaluation, and serialized source removal.

| Model | Runtime |
| --- | --- |
| `RecordExactCompletedResponse` | `dispatchRemoveSafetyHandoffRequest` records `COMPLETED` in `priorityPublicationReplacementLeaderElectionEvidenceByOperationId` |
| `RecordNotFoundResponse` | the same evidence owner records the exact missing replica for alternate-voter retargeting |
| `RouteExactEvidence` | `shouldContinueAfterRemoveSafetyHandoffResponse` consumes the continuation state/action table |
| `ContinueExactEvidenceSameTurn` | `EXACT_TARGET_ELECTION_EVIDENCE_RECORDED → CONTINUE` |
| `ExpireRetryAndRetarget` | request-retry evidence expiry allows a later alternate election target |
| `EvaluateCanonicalRemoveSafety` | `operation-workflow-dispatch-response-reconcile` calls `evaluateRemoveSafety` again |
| voter/quorum/membership/leadership/peer guards | the existing remove-safety evaluator and priority-publication safety owner |
| `interlockAvailable` / `interlockHeld` | existing concurrent-operation and serialized operation-ledger protection |
| `sourceRemoved` | normal `REMOVE_REPLICA` dispatch after a safe evaluation |

The fixed configuration proves that exact completed evidence cannot be
retargeted, continuation never owns authorization, removal retains all named
guards plus the interlock, safe exact evidence eventually removes the source,
and `NOT_FOUND` still permits retargeting. The delayed-continuation mutant lets
retry expiry retarget exact evidence. The continuation-authority mutant removes
through the wrong owner without acquiring the interlock.

This is intentionally not a claim that every interaction between repository
layers is modeled in TLA+ or Alloy.
