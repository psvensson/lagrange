---------------- MODULE FormationBarrierSpreadCureLiveness ----------------
(***************************************************************************)
(* CL-044: a cold-formation READY-lease hold waits on the GLOBAL startup   *)
(* authority predicate, so every priority-partition spread gap must close  *)
(* before either held joiner can release.                                  *)
(*                                                                         *)
(* One tick is one second. Each open gap owns an independent rebalancer,   *)
(* but this deliberately conservative scheduler closes at most one gap per *)
(* event-cadence evaluation. FixEnabled gives a connected JOINING startup  *)
(* authority member the same cure-target meaning at placement and settle  *)
(* planning, then re-arms evaluation at EventCadenceSec on a terminal or   *)
(* placement-eligibility edge. AdmissionAuthorityPreserved carries that    *)
(* operation-creation verdict through a token-stale deferred readiness     *)
(* snapshot, whose fail-closed projection otherwise erases recoveryActive  *)
(* and vetoes the cure at mutation admission.                              *)
(*                                                                         *)
(* This model proves scheduler arithmetic, not storage/network health: an  *)
(* event-cadence tick represents a causally relevant progress edge already *)
(* produced by the existing workflow. A genuinely absent progress edge    *)
(* remains protected by the unchanged fail-closed barrier timeout.         *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS FixEnabled,
          AdmissionAuthorityPreserved,
          DeferredAdmissionSnapshot,
          WholePlaneGapCount,
          EventCadenceSec,
          EscalatedSettleCadenceSec,
          BarrierBudgetSec

ASSUME FixEnabled \in BOOLEAN
ASSUME AdmissionAuthorityPreserved \in BOOLEAN
ASSUME DeferredAdmissionSnapshot \in BOOLEAN
ASSUME WholePlaneGapCount \in Nat \ {0}
ASSUME EventCadenceSec \in Nat \ {0}
ASSUME EscalatedSettleCadenceSec \in Nat \ {0}
ASSUME BarrierBudgetSec \in Nat \ {0}

VARIABLES clock,
          openGaps,
          nextEvaluationAt,
          joinerHold

vars == <<clock, openGaps, nextEvaluationAt, joinerHold>>

CureScheduleUpperBoundSec == WholePlaneGapCount * EventCadenceSec

TypeOK ==
  /\ clock \in 0..BarrierBudgetSec
  /\ openGaps \in 0..WholePlaneGapCount
  /\ nextEvaluationAt \in Nat
  /\ joinerHold \in BOOLEAN

Init ==
  /\ clock = 0
  /\ openGaps = WholePlaneGapCount
  /\ nextEvaluationAt = EventCadenceSec
  /\ joinerHold = TRUE

EvaluateOpenGap ==
  /\ joinerHold
  /\ openGaps > 0
  /\ clock = nextEvaluationAt
  /\ IF FixEnabled
     THEN /\ IF ~DeferredAdmissionSnapshot \/ AdmissionAuthorityPreserved
             THEN openGaps' = openGaps - 1
             ELSE UNCHANGED openGaps
          /\ nextEvaluationAt' = clock + EventCadenceSec
     ELSE /\ UNCHANGED openGaps
          /\ nextEvaluationAt' = clock + EscalatedSettleCadenceSec
  /\ UNCHANGED <<clock, joinerHold>>

Tick ==
  /\ joinerHold
  /\ openGaps > 0
  /\ clock < BarrierBudgetSec
  /\ clock # nextEvaluationAt
  /\ clock' = clock + 1
  /\ UNCHANGED <<openGaps, nextEvaluationAt, joinerHold>>

ReleaseGlobalStartupAuthority ==
  /\ joinerHold
  /\ openGaps = 0
  /\ joinerHold' = FALSE
  /\ UNCHANGED <<clock, openGaps, nextEvaluationAt>>

TerminalStutter ==
  /\ (~joinerHold \/ clock = BarrierBudgetSec)
  /\ UNCHANGED vars

Next ==
  \/ EvaluateOpenGap
  \/ Tick
  \/ ReleaseGlobalStartupAuthority
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(EvaluateOpenGap)
  /\ WF_vars(Tick)
  /\ WF_vars(ReleaseGlobalStartupAuthority)

Spec == Init /\ [][Next]_vars /\ Fairness

ScheduleArithmeticWithinBarrierBudget ==
  CureScheduleUpperBoundSec <= BarrierBudgetSec

ReleasedOnlyAfterWholePlaneCure ==
  ~joinerHold => openGaps = 0

JoinerHoldEventuallyReleases == <>~joinerHold
=============================================================================
