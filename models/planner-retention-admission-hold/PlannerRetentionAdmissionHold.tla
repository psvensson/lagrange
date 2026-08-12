---------------- MODULE PlannerRetentionAdmissionHold ----------------
(***************************************************************************)
(* Planner retention -> over-target admission-hold contract.              *)
(*                                                                         *)
(* The witnessed cold-formation state has four replicas concentrated on   *)
(* two distinct nodes while the published target is three replicas on     *)
(* three nodes. The planner retains exactly one bounded spread-cure ADD.   *)
(* Admission must exempt that retained cure from the ordinary over-target  *)
(* hold. Its completion temporarily reaches five replicas on three nodes;  *)
(* the surplus drain can then remove two replicas and settle at three on   *)
(* three nodes.                                                            *)
(*                                                                         *)
(* HoldRetainedCureWhenOverTarget is the sole policy toggle. FALSE models  *)
(* the exact exemption. TRUE models the historical unconditional hold,    *)
(* which strands the retained cure at the witnessed initial state.        *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT HoldRetainedCureWhenOverTarget

TargetReplicaCount == 3
TargetDistinctNodeCount == 3
InitialReplicaCount == 4
InitialDistinctNodeCount == 2
MaximumCureReplicaCount == 5

Retained == "retained"
Admitted == "admitted"
SpreadComplete == "spread_complete"
Draining == "draining"
Settled == "settled"
Phases == {Retained, Admitted, SpreadComplete, Draining, Settled}

NoAdmission == "none"
SpreadCureAdmission == "spread_cure"
AdmissionKinds == {NoAdmission, SpreadCureAdmission}

VARIABLES replicaCount,
          distinctNodeCount,
          previousDistinctNodeCount,
          phase,
          admittedKind,
          completedCureAdds

vars == << replicaCount,
           distinctNodeCount,
           previousDistinctNodeCount,
           phase,
           admittedKind,
           completedCureAdds >>

TypeOK ==
  /\ HoldRetainedCureWhenOverTarget \in BOOLEAN
  /\ replicaCount \in TargetReplicaCount..MaximumCureReplicaCount
  /\ distinctNodeCount \in InitialDistinctNodeCount..TargetDistinctNodeCount
  /\ previousDistinctNodeCount \in
       InitialDistinctNodeCount..TargetDistinctNodeCount
  /\ phase \in Phases
  /\ admittedKind \in AdmissionKinds
  /\ completedCureAdds \in 0..1

Init ==
  /\ replicaCount = InitialReplicaCount
  /\ distinctNodeCount = InitialDistinctNodeCount
  /\ previousDistinctNodeCount = InitialDistinctNodeCount
  /\ phase = Retained
  /\ admittedKind = NoAdmission
  /\ completedCureAdds = 0

OverTarget == replicaCount > TargetReplicaCount
SpreadGapOpen == distinctNodeCount < TargetDistinctNodeCount
PlannerRetainedSpreadCure ==
  /\ phase = Retained
  /\ OverTarget
  /\ SpreadGapOpen
  /\ completedCureAdds = 0

(* The production contract's exact exemption: ordinary surplus additions  *)
(* remain held; only the already-retained spread cure is admitted.         *)
AdmissionAllowsRetainedSpreadCure ==
  /\ PlannerRetainedSpreadCure
  /\ ~HoldRetainedCureWhenOverTarget

AdmitRetainedSpreadCure ==
  /\ AdmissionAllowsRetainedSpreadCure
  /\ phase' = Admitted
  /\ admittedKind' = SpreadCureAdmission
  /\ UNCHANGED << replicaCount,
                  distinctNodeCount,
                  previousDistinctNodeCount,
                  completedCureAdds >>

CompleteRetainedSpreadCure ==
  /\ phase = Admitted
  /\ admittedKind = SpreadCureAdmission
  /\ replicaCount = InitialReplicaCount
  /\ distinctNodeCount = InitialDistinctNodeCount
  /\ replicaCount' = MaximumCureReplicaCount
  /\ previousDistinctNodeCount' = distinctNodeCount
  /\ distinctNodeCount' = TargetDistinctNodeCount
  /\ phase' = SpreadComplete
  /\ admittedKind' = NoAdmission
  /\ completedCureAdds' = 1

DrainSurplusReplica ==
  /\ phase \in {SpreadComplete, Draining}
  /\ completedCureAdds = 1
  /\ replicaCount > TargetReplicaCount
  /\ replicaCount' = replicaCount - 1
  /\ previousDistinctNodeCount' = distinctNodeCount
  /\ phase' =
       IF replicaCount' = TargetReplicaCount THEN Settled ELSE Draining
  /\ UNCHANGED << distinctNodeCount, admittedKind, completedCureAdds >>

(* Stable mutant witness. CHECK_DEADLOCK is disabled in both configs, so   *)
(* the bug is proved by a fair temporal counterexample rather than by TLC  *)
(* interpreting the held state as an accidental deadlock.                 *)
WaitOnUnconditionalOverTargetHold ==
  /\ PlannerRetainedSpreadCure
  /\ HoldRetainedCureWhenOverTarget
  /\ UNCHANGED vars

TerminalStutter ==
  /\ phase = Settled
  /\ UNCHANGED vars

Next ==
  \/ AdmitRetainedSpreadCure
  \/ CompleteRetainedSpreadCure
  \/ DrainSurplusReplica
  \/ WaitOnUnconditionalOverTargetHold
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(AdmitRetainedSpreadCure)
  /\ WF_vars(CompleteRetainedSpreadCure)
  /\ WF_vars(DrainSurplusReplica)

Spec == Init /\ [][Next]_vars /\ Fairness

(* Safety: no path removes below target, loses spread, or manufactures a   *)
(* second/non-cure surplus addition while closing the spread gap.          *)
ReplicaFloorPreserved == replicaCount >= TargetReplicaCount

DistinctNodeSpreadNeverRegresses ==
  distinctNodeCount >= previousDistinctNodeCount

OnlyRetainedCureCanGrowSurplus ==
  /\ completedCureAdds <= 1
  /\ (replicaCount > InitialReplicaCount =>
        /\ completedCureAdds = 1
        /\ distinctNodeCount = TargetDistinctNodeCount)

AdmissionIsExactlyTheRetainedCure ==
  admittedKind # SpreadCureAdmission \/ phase = Admitted

SettlementIsExact ==
  (phase = Settled) =>
    /\ replicaCount = TargetReplicaCount
    /\ distinctNodeCount = TargetDistinctNodeCount
    /\ completedCureAdds = 1

EventuallySettled ==
  <>(/\ phase = Settled
     /\ replicaCount = TargetReplicaCount
     /\ distinctNodeCount = TargetDistinctNodeCount)

=============================================================================
