------------- MODULE OperationLedgerSelfMoveWaiterFairness -------------
(***************************************************************************)
(* A narrow model of the operation-ledger writer-fairness edge.            *)
(*                                                                         *)
(* The old admission-only protocol lets each newly admitted writer replace *)
(* the incumbent just before the ledger self-move observes an idle turn.    *)
(* The fixed protocol publishes one durable PENDING waiter on that same     *)
(* admission turn. New writers then stop overtaking, the incumbent drains,  *)
(* and physical dispatch occurs only from an authoritative idle state.      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT DurableWaiterEnabled

Absent == "absent"
Pending == "pending"
Dispatching == "dispatching"
Complete == "complete"
WaiterStates == {Absent, Pending, Dispatching, Complete}

VARIABLES incumbentCount,
          waiterState,
          newcomerGeneration

vars == <<incumbentCount, waiterState, newcomerGeneration>>

TypeOK ==
  /\ incumbentCount \in 0..1
  /\ waiterState \in WaiterStates
  /\ newcomerGeneration \in 0..1

Init ==
  /\ incumbentCount = 1
  /\ waiterState = Absent
  /\ newcomerGeneration = 0

(* One scheduling turn at the admission boundary. In the mutant, a new     *)
(* writer replaces the just-finished incumbent forever. In the fixed        *)
(* protocol, the durable waiter wins this turn and closes admission.        *)
AdmissionTurn ==
  /\ waiterState = Absent
  /\ incumbentCount = 1
  /\ IF DurableWaiterEnabled
        THEN /\ waiterState' = Pending
             /\ UNCHANGED <<incumbentCount, newcomerGeneration>>
        ELSE /\ newcomerGeneration' = 1 - newcomerGeneration
             /\ UNCHANGED <<incumbentCount, waiterState>>

DrainIncumbent ==
  /\ waiterState = Pending
  /\ incumbentCount = 1
  /\ incumbentCount' = 0
  /\ UNCHANGED <<waiterState, newcomerGeneration>>

DispatchAfterAuthoritativeIdle ==
  /\ waiterState = Pending
  /\ incumbentCount = 0
  /\ waiterState' = Dispatching
  /\ UNCHANGED <<incumbentCount, newcomerGeneration>>

CompleteSelfMove ==
  /\ waiterState = Dispatching
  /\ waiterState' = Complete
  /\ UNCHANGED <<incumbentCount, newcomerGeneration>>

TerminalStutter ==
  /\ waiterState = Complete
  /\ UNCHANGED vars

Next ==
  \/ AdmissionTurn
  \/ DrainIncumbent
  \/ DispatchAfterAuthoritativeIdle
  \/ CompleteSelfMove
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(AdmissionTurn)
  /\ WF_vars(DrainIncumbent)
  /\ WF_vars(DispatchAfterAuthoritativeIdle)
  /\ WF_vars(CompleteSelfMove)

Spec == Init /\ [][Next]_vars /\ Fairness

DispatchRequiresIdle == waiterState # Dispatching \/ incumbentCount = 0

DurableWaiterStopsOvertaking ==
  waiterState = Absent \/ newcomerGeneration = 0

EventuallySelfMoveCompletes == <>(waiterState = Complete)

=============================================================================
