---------------- MODULE TerminalOperationEntityObservation ----------------
(***************************************************************************)
(* Terminal replica-operation authority -> entity recovery observation ->  *)
(* priority surplus drain -> fresh-formation readiness.                    *)
(*                                                                         *)
(* A priority ADD can be durably terminal while an older SQL replica still *)
(* reports CREATING. The fixed entity observation requires the owner/leader *)
(* lane and therefore defers when that authority is unavailable. The bug   *)
(* toggle admits the stale SQL row as if it were authoritative.            *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT AllowStaleSqlFallback

ASSUME AllowStaleSqlFallback \in BOOLEAN

VARIABLES durableStep,
          ownerAvailable,
          entityObservation,
          surplusRemove,
          formation

vars == <<durableStep,
          ownerAvailable,
          entityObservation,
          surplusRemove,
          formation>>

DurableSteps == {"creating", "terminal"}
EntityObservations == {"unobserved", "creating", "terminal", "deferred"}
SurplusRemoveStates == {"not_planned", "planned", "complete"}
FormationStates == {"blocked", "ready"}

TypeOK ==
  /\ durableStep \in DurableSteps
  /\ ownerAvailable \in BOOLEAN
  /\ entityObservation \in EntityObservations
  /\ surplusRemove \in SurplusRemoveStates
  /\ formation \in FormationStates

Init ==
  /\ durableStep = "creating"
  /\ ownerAvailable = TRUE
  /\ entityObservation = "unobserved"
  /\ surplusRemove = "not_planned"
  /\ formation = "blocked"

(* The existing workflow owner commits and confirms the terminal ADD. The  *)
(* next entity read races a temporarily unavailable owner/leader lane.      *)
CompleteAdd ==
  /\ durableStep = "creating"
  /\ durableStep' = "terminal"
  /\ ownerAvailable' = FALSE
  /\ entityObservation' = "unobserved"
  /\ UNCHANGED <<surplusRemove, formation>>

(* OWNER_RPC_REQUIRED fails closed to a typed deferral regardless of any   *)
(* healthy-looking recovery-readiness snapshot. The mutant instead accepts *)
(* the older SQL CREATING row and re-enters the completed drain.            *)
ObserveWhileOwnerUnavailable ==
  /\ durableStep = "terminal"
  /\ ~ownerAvailable
  /\ entityObservation \in {"unobserved", "deferred", "creating"}
  /\ entityObservation' =
       IF AllowStaleSqlFallback THEN "creating" ELSE "deferred"
  /\ UNCHANGED <<durableStep, ownerAvailable, surplusRemove, formation>>

RecoverOwner ==
  /\ durableStep = "terminal"
  /\ ~ownerAvailable
  /\ ownerAvailable' = TRUE
  /\ UNCHANGED <<durableStep, entityObservation, surplusRemove, formation>>

ObserveTerminalAtOwner ==
  /\ durableStep = "terminal"
  /\ ownerAvailable
  /\ entityObservation # "terminal"
  /\ entityObservation' = "terminal"
  /\ UNCHANGED <<durableStep, ownerAvailable, surplusRemove, formation>>

PlanExistingSurplusRemove ==
  /\ entityObservation = "terminal"
  /\ surplusRemove = "not_planned"
  /\ surplusRemove' = "planned"
  /\ UNCHANGED <<durableStep, ownerAvailable, entityObservation, formation>>

CompleteExistingSurplusRemove ==
  /\ surplusRemove = "planned"
  /\ surplusRemove' = "complete"
  /\ formation' = "ready"
  /\ UNCHANGED <<durableStep, ownerAvailable, entityObservation>>

ReadyStutter ==
  /\ formation = "ready"
  /\ UNCHANGED vars

Next ==
  \/ CompleteAdd
  \/ ObserveWhileOwnerUnavailable
  \/ RecoverOwner
  \/ ObserveTerminalAtOwner
  \/ PlanExistingSurplusRemove
  \/ CompleteExistingSurplusRemove
  \/ ReadyStutter

Fairness ==
  /\ WF_vars(CompleteAdd)
  /\ WF_vars(RecoverOwner)
  /\ WF_vars(ObserveTerminalAtOwner)
  /\ WF_vars(PlanExistingSurplusRemove)
  /\ WF_vars(CompleteExistingSurplusRemove)

Spec == Init /\ [][Next]_vars /\ Fairness

ConfirmedTerminalNeverReentersCreating ==
  durableStep = "terminal" => entityObservation # "creating"

FormationReadyRequiresTerminalDrain ==
  formation = "ready" =>
    entityObservation = "terminal" /\ surplusRemove = "complete"

EventuallyFormationReady == <> (formation = "ready")
=============================================================================
