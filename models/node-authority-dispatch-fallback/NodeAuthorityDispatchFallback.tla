---------------- MODULE NodeAuthorityDispatchFallback ----------------
(***************************************************************************)
(* Authoritative node read -> typed failure or definitive absence ->       *)
(* existing priority-recovery dispatch fallback.                           *)
(*                                                                         *)
(* The fixed owner preserves failed reads as typed failures. The mutant    *)
(* collapses them into the same missing observation as a successful empty  *)
(* read, so the already-ready synchronous recovery snapshot is never used. *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT CollapseFailureToMissing

ASSUME CollapseFailureToMissing \in BOOLEAN

VARIABLES workClass,
          syncRecoveryEligible,
          authorityResult,
          nodeObservation,
          dispatchRoute,
          retryState

vars == <<workClass,
          syncRecoveryEligible,
          authorityResult,
          nodeObservation,
          dispatchRoute,
          retryState>>

WorkClasses == {"priority_recovery", "ordinary_repair"}
AuthorityResults == {
  "pending",
  "success_row",
  "success_empty",
  "retryable_failure",
  "nonretryable_failure"
}
NodeObservations == {
  "unobserved",
  "present",
  "missing",
  "typed_retryable_failure",
  "typed_nonretryable_failure"
}
DispatchRoutes == {"none", "authoritative", "sync_recovery_fallback"}
RetryStates == {"idle", "fallback_used", "deferred"}

TypeOK ==
  /\ workClass \in WorkClasses
  /\ syncRecoveryEligible \in BOOLEAN
  /\ authorityResult \in AuthorityResults
  /\ nodeObservation \in NodeObservations
  /\ dispatchRoute \in DispatchRoutes
  /\ retryState \in RetryStates

Init ==
  /\ workClass \in WorkClasses
  /\ syncRecoveryEligible \in BOOLEAN
  /\ authorityResult = "pending"
  /\ nodeObservation = "unobserved"
  /\ dispatchRoute = "none"
  /\ retryState = "idle"

ObserveAuthority ==
  /\ authorityResult = "pending"
  /\ \E outcome \in AuthorityResults \ {"pending"}:
       /\ authorityResult' = outcome
       /\ nodeObservation' =
            CASE outcome = "success_row" -> "present"
              [] outcome = "success_empty" -> "missing"
              [] outcome = "retryable_failure" ->
                   IF CollapseFailureToMissing
                   THEN "missing"
                   ELSE "typed_retryable_failure"
              [] OTHER ->
                   IF CollapseFailureToMissing
                   THEN "missing"
                   ELSE "typed_nonretryable_failure"
  /\ UNCHANGED <<workClass,
                  syncRecoveryEligible,
                  dispatchRoute,
                  retryState>>

DispatchFromAuthoritativeRow ==
  /\ nodeObservation = "present"
  /\ dispatchRoute = "none"
  /\ dispatchRoute' = "authoritative"
  /\ UNCHANGED <<workClass,
                  syncRecoveryEligible,
                  authorityResult,
                  nodeObservation,
                  retryState>>

UseExistingRecoveryFallback ==
  /\ nodeObservation = "typed_retryable_failure"
  /\ workClass = "priority_recovery"
  /\ syncRecoveryEligible
  /\ dispatchRoute = "none"
  /\ dispatchRoute' = "sync_recovery_fallback"
  /\ retryState' = "fallback_used"
  /\ UNCHANGED <<workClass,
                  syncRecoveryEligible,
                  authorityResult,
                  nodeObservation>>

DeferWithoutFallback ==
  /\ dispatchRoute = "none"
  /\ retryState = "idle"
  /\ \/ nodeObservation = "missing"
     \/ nodeObservation = "typed_nonretryable_failure"
     \/ /\ nodeObservation = "typed_retryable_failure"
        /\ \/ workClass # "priority_recovery"
           \/ ~syncRecoveryEligible
  /\ retryState' = "deferred"
  /\ UNCHANGED <<workClass,
                  syncRecoveryEligible,
                  authorityResult,
                  nodeObservation,
                  dispatchRoute>>

Next ==
  \/ ObserveAuthority
  \/ DispatchFromAuthoritativeRow
  \/ UseExistingRecoveryFallback
  \/ DeferWithoutFallback

Fairness ==
  /\ WF_vars(ObserveAuthority)
  /\ WF_vars(DispatchFromAuthoritativeRow)
  /\ WF_vars(UseExistingRecoveryFallback)
  /\ WF_vars(DeferWithoutFallback)

Spec == Init /\ [][Next]_vars /\ Fairness

MissingMeansSuccessfulEmpty ==
  nodeObservation = "missing" => authorityResult = "success_empty"

SuccessfulEmptyNeverDispatches ==
  authorityResult = "success_empty" => dispatchRoute = "none"

NonRetryableFailureNeverDispatches ==
  authorityResult = "nonretryable_failure" => dispatchRoute = "none"

FallbackRequiresCanonicalRecoveryEvidence ==
  dispatchRoute = "sync_recovery_fallback" =>
    /\ authorityResult = "retryable_failure"
    /\ nodeObservation = "typed_retryable_failure"
    /\ workClass = "priority_recovery"
    /\ syncRecoveryEligible

EventuallyPriorityRecoveryDispatch ==
  [](
    /\ authorityResult = "retryable_failure"
    /\ workClass = "priority_recovery"
    /\ syncRecoveryEligible
    => <> (dispatchRoute = "sync_recovery_fallback")
  )
=============================================================================
