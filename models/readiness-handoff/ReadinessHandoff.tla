------------------------- MODULE ReadinessHandoff -------------------------
(***************************************************************************)
(* Low-resolution startup readiness / handoff model.                        *)
(*                                                                         *)
(* The model captures three implementation hazards seen in controller-style  *)
(* systems: readiness promoted before canonical services are usable, stale   *)
(* projection epochs treated as fresh, and durable deferred owner outcomes   *)
(* stranded without a recoverable wake.                                     *)
(*                                                                         *)
(* AllowUnsafeReadiness selects the forbidden promotion variant.             *)
(* LoseWake selects the forbidden committed-defer-without-wake variant.      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS AllowUnsafeReadiness, LoseWake

VARIABLES phase,
          sqlServiceable,
          queryServiceable,
          ownerEpoch,
          observedEpoch,
          ownerOutcome,
          wakeQueued

vars == << phase,
          sqlServiceable,
          queryServiceable,
          ownerEpoch,
          observedEpoch,
          ownerOutcome,
          wakeQueued >>

Phase ==
  {"boot", "handoff", "steady", "blocked", "escalated"}

Outcome ==
  {"pending", "deferred", "ready", "blocked", "escalated"}

TypeOK ==
  /\ phase \in Phase
  /\ sqlServiceable \in BOOLEAN
  /\ queryServiceable \in BOOLEAN
  /\ ownerEpoch \in 0..2
  /\ observedEpoch \in 0..2
  /\ observedEpoch <= ownerEpoch
  /\ ownerOutcome \in Outcome
  /\ wakeQueued \in BOOLEAN

Init ==
  /\ phase = "boot"
  /\ sqlServiceable = FALSE
  /\ queryServiceable = FALSE
  /\ ownerEpoch = 0
  /\ observedEpoch = 0
  /\ ownerOutcome = "pending"
  /\ wakeQueued = FALSE

Terminal ==
  phase \in {"steady", "blocked", "escalated"}

ObserveSqlService ==
  /\ sqlServiceable = FALSE
  /\ sqlServiceable' = TRUE
  /\ UNCHANGED << phase, queryServiceable, ownerEpoch, observedEpoch,
                  ownerOutcome, wakeQueued >>

ObserveQueryTransport ==
  /\ queryServiceable = FALSE
  /\ queryServiceable' = TRUE
  /\ UNCHANGED << phase, sqlServiceable, ownerEpoch, observedEpoch,
                  ownerOutcome, wakeQueued >>

DeferStartupHandoff ==
  /\ phase = "boot"
  /\ ~(sqlServiceable /\ queryServiceable)
  /\ ownerEpoch < 2
  /\ phase' = "handoff"
  /\ ownerEpoch' = ownerEpoch + 1
  /\ ownerOutcome' = "deferred"
  /\ wakeQueued' = IF LoseWake THEN FALSE ELSE TRUE
  /\ UNCHANGED << sqlServiceable, queryServiceable, observedEpoch >>

RefreshProjection ==
  /\ wakeQueued
  /\ observedEpoch < ownerEpoch
  /\ observedEpoch' = ownerEpoch
  /\ UNCHANGED << phase, sqlServiceable, queryServiceable, ownerEpoch,
                  ownerOutcome, wakeQueued >>

PromoteReady ==
  /\ phase \in {"boot", "handoff"}
  /\ AllowUnsafeReadiness \/ (
       sqlServiceable /\
       queryServiceable /\
       observedEpoch = ownerEpoch
     )
  /\ phase' = "steady"
  /\ ownerOutcome' = "ready"
  /\ wakeQueued' = FALSE
  /\ UNCHANGED << sqlServiceable, queryServiceable, ownerEpoch, observedEpoch >>

BlockDeferredHandoff ==
  /\ phase = "handoff"
  /\ wakeQueued
  /\ observedEpoch = ownerEpoch
  /\ ~(sqlServiceable /\ queryServiceable)
  /\ phase' = "blocked"
  /\ ownerOutcome' = "blocked"
  /\ wakeQueued' = FALSE
  /\ UNCHANGED << sqlServiceable, queryServiceable, ownerEpoch, observedEpoch >>

RecoverLostWake ==
  /\ phase = "handoff"
  /\ ownerOutcome = "deferred"
  /\ wakeQueued = FALSE
  /\ LoseWake = FALSE
  /\ wakeQueued' = TRUE
  /\ UNCHANGED << phase, sqlServiceable, queryServiceable, ownerEpoch,
                  observedEpoch, ownerOutcome >>

TerminalStutter ==
  /\ Terminal
  /\ UNCHANGED vars

Next ==
  \/ ObserveSqlService
  \/ ObserveQueryTransport
  \/ DeferStartupHandoff
  \/ RefreshProjection
  \/ PromoteReady
  \/ BlockDeferredHandoff
  \/ RecoverLostWake
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(ObserveSqlService)
  /\ WF_vars(ObserveQueryTransport)
  /\ WF_vars(DeferStartupHandoff)
  /\ WF_vars(RefreshProjection)
  /\ WF_vars(PromoteReady)
  /\ WF_vars(BlockDeferredHandoff)
  /\ WF_vars(RecoverLostWake)

Spec == Init /\ [][Next]_vars /\ Fairness

ReadyRequiresCanonicalServiceability ==
  ownerOutcome = "ready" =>
    /\ sqlServiceable
    /\ queryServiceable
    /\ observedEpoch = ownerEpoch

DeferredOutcomeHasRecoverableWake ==
  ownerOutcome = "deferred" => wakeQueued

StaleProjectionNeverPromotes ==
  ownerOutcome = "ready" => observedEpoch = ownerEpoch

EventuallyTerminal == <>Terminal
=============================================================================
