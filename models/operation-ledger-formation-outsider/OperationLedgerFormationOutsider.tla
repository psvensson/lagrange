-------------------- MODULE OperationLedgerFormationOutsider --------------------
EXTENDS Naturals, TLC

CONSTANTS FixEnabled, ForceFloorSchedule, TargetReplicaCount,
          InitialReadyCount, RequestTicks, PollSleepTicks,
          BarrierBudgetTicks

VARIABLES coldFormationObserved, floorSnapshotObserved,
          readyCandidateCount, outsiderState, outsiderBypassed,
          outsiderFloorBypassExercised, capturedSelfState,
          capturedSelfBypassed, elapsedTicks

vars == <<coldFormationObserved, floorSnapshotObserved, readyCandidateCount,
          outsiderState, outsiderBypassed, capturedSelfState,
          outsiderFloorBypassExercised, capturedSelfBypassed, elapsedTicks>>

DISCOVERING == 0
COLD_WAIT == 1
RELEASED == 2
TIMED_OUT == 3
SELF_WAIT == 4

Init ==
  /\ coldFormationObserved = FALSE
  /\ floorSnapshotObserved = FALSE
  /\ readyCandidateCount = InitialReadyCount
  /\ outsiderState = DISCOVERING
  /\ outsiderBypassed = FALSE
  /\ outsiderFloorBypassExercised = FALSE
  /\ capturedSelfState = SELF_WAIT
  /\ capturedSelfBypassed = FALSE
  /\ elapsedTicks = 0

CadenceTicks == RequestTicks + PollSleepTicks

ChargeCadence ==
  elapsedTicks' = IF elapsedTicks + CadenceTicks <= BarrierBudgetTicks
    THEN elapsedTicks + CadenceTicks
    ELSE elapsedTicks

ObserveColdFormation ==
  /\ outsiderState = DISCOVERING
  /\ readyCandidateCount < TargetReplicaCount
  /\ coldFormationObserved' = TRUE
  /\ outsiderState' = COLD_WAIT
  /\ ChargeCadence
  /\ UNCHANGED <<floorSnapshotObserved, readyCandidateCount,
                  outsiderBypassed, outsiderFloorBypassExercised,
                  capturedSelfState,
                  capturedSelfBypassed>>

ObserveEstablishedReadyFloor ==
  /\ coldFormationObserved
  /\ ~floorSnapshotObserved
  /\ outsiderState = COLD_WAIT
  /\ floorSnapshotObserved' = TRUE
  /\ readyCandidateCount' = TargetReplicaCount
  /\ outsiderState' = IF FixEnabled THEN RELEASED ELSE COLD_WAIT
  /\ outsiderBypassed' = FixEnabled
  /\ outsiderFloorBypassExercised' = FixEnabled
  /\ ChargeCadence
  /\ UNCHANGED <<coldFormationObserved, capturedSelfState,
                  capturedSelfBypassed>>

ReleaseCapturedSelf ==
  /\ capturedSelfState = SELF_WAIT
  /\ capturedSelfState' = RELEASED
  /\ ChargeCadence
  /\ UNCHANGED <<coldFormationObserved, floorSnapshotObserved,
                  readyCandidateCount, outsiderState, outsiderBypassed,
                  outsiderFloorBypassExercised,
                  capturedSelfBypassed>>

TimeoutWaitingOutsider ==
  /\ outsiderState = COLD_WAIT
  /\ elapsedTicks = BarrierBudgetTicks
  /\ (~ForceFloorSchedule \/ floorSnapshotObserved)
  /\ outsiderState' = TIMED_OUT
  /\ UNCHANGED <<coldFormationObserved, floorSnapshotObserved,
                  readyCandidateCount, outsiderBypassed,
                  outsiderFloorBypassExercised,
                  capturedSelfState, capturedSelfBypassed, elapsedTicks>>

CadenceTick ==
  /\ outsiderState \in {DISCOVERING, COLD_WAIT}
  /\ (~ForceFloorSchedule \/ floorSnapshotObserved)
  /\ elapsedTicks + CadenceTicks <= BarrierBudgetTicks
  /\ elapsedTicks' = elapsedTicks + CadenceTicks
  /\ UNCHANGED <<coldFormationObserved, floorSnapshotObserved,
                  readyCandidateCount, outsiderState, outsiderBypassed,
                  outsiderFloorBypassExercised,
                  capturedSelfState, capturedSelfBypassed>>

Next ==
  \/ ObserveColdFormation
  \/ ObserveEstablishedReadyFloor
  \/ ReleaseCapturedSelf
  \/ TimeoutWaitingOutsider
  \/ CadenceTick

Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ WF_vars(ObserveColdFormation)
  /\ WF_vars(ObserveEstablishedReadyFloor)
  /\ WF_vars(ReleaseCapturedSelf)
  /\ WF_vars(TimeoutWaitingOutsider)
  /\ WF_vars(CadenceTick)

TypeInvariant ==
  /\ FixEnabled \in BOOLEAN
  /\ ForceFloorSchedule \in BOOLEAN
  /\ TargetReplicaCount \in Nat \ {0}
  /\ InitialReadyCount \in 0..(TargetReplicaCount - 1)
  /\ BarrierBudgetTicks \in Nat \ {0}
  /\ RequestTicks \in Nat \ {0}
  /\ PollSleepTicks \in Nat \ {0}
  /\ CadenceTicks <= BarrierBudgetTicks
  /\ 3 * CadenceTicks <= BarrierBudgetTicks
  /\ coldFormationObserved \in BOOLEAN
  /\ floorSnapshotObserved \in BOOLEAN
  /\ readyCandidateCount \in InitialReadyCount..TargetReplicaCount
  /\ outsiderState \in {DISCOVERING, COLD_WAIT, RELEASED, TIMED_OUT}
  /\ outsiderBypassed \in BOOLEAN
  /\ outsiderFloorBypassExercised \in BOOLEAN
  /\ capturedSelfState \in {SELF_WAIT, RELEASED}
  /\ capturedSelfBypassed \in BOOLEAN
  /\ elapsedTicks \in 0..BarrierBudgetTicks

SelfCaptureNeverBypasses == ~capturedSelfBypassed

OutsiderBypassRequiresActualReadyFloor ==
  outsiderBypassed =>
    (floorSnapshotObserved /\
     readyCandidateCount >= TargetReplicaCount /\
     outsiderState = RELEASED)

OutsiderFloorBypassMarkerIsCausal ==
  outsiderFloorBypassExercised =>
    (FixEnabled /\ floorSnapshotObserved /\ outsiderBypassed /\
     outsiderState = RELEASED)

OutsiderFloorBypassMeetsCadenceBudget ==
  outsiderFloorBypassExercised => elapsedTicks <= 3 * CadenceTicks

FloorScheduleIsExercised == <> floorSnapshotObserved

OutsiderFloorBypassCoverage == <> outsiderFloorBypassExercised

CapturedSelfEventuallyUsesExactRelease == <> (capturedSelfState = RELEASED)

OutsiderEventuallyLeavesWithinBudget ==
  floorSnapshotObserved ~>
    (outsiderState = RELEASED /\ elapsedTicks <= BarrierBudgetTicks)

=============================================================================
