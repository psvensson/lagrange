---------------- MODULE OperationLedgerTerminalHold ----------------
(***************************************************************************)
(* Focused operation-ledger self-move lifecycle -> admission -> snapshot  *)
(* composition (quest movielens-operation-ledger-terminal-hold).          *)
(*                                                                         *)
(* The physical target/source workflow can continue while its self-hosted  *)
(* durable row is unable to refresh. Crossing the durable step timeout     *)
(* transfers responsibility to the workflow recovery owner; it is not     *)
(* terminal evidence. The recovery owner releases serialization only by   *)
(* publishing the canonical terminal transition.                          *)
(*                                                                         *)
(* This is a deliberately narrow cross-layer proof, not exhaustive formal *)
(* coverage of repository-layer interactions.                             *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT TimeoutOnlyReleasesHold

TargetProgress == "target_progress"
SourceProgress == "source_progress"
PhysicalDone == "physical_done"
PhysicalPhases == {TargetProgress, SourceProgress, PhysicalDone}

DurableSending == "durable_sending"
DurableTerminal == "durable_terminal"
DurablePhases == {DurableSending, DurableTerminal}

VARIABLES physicalPhase,
          durablePhase,
          durableStepTimedOut,
          recoveryOwnerClaimed,
          holdEngaged,
          dependentBatchAdmitted,
          workflowWritesAvailable,
          dependentBatchComplete,
          snapshotClosed

vars == << physicalPhase,
           durablePhase,
           durableStepTimedOut,
           recoveryOwnerClaimed,
           holdEngaged,
           dependentBatchAdmitted,
           workflowWritesAvailable,
           dependentBatchComplete,
           snapshotClosed >>

TypeOK ==
  /\ physicalPhase \in PhysicalPhases
  /\ durablePhase \in DurablePhases
  /\ durableStepTimedOut \in BOOLEAN
  /\ recoveryOwnerClaimed \in BOOLEAN
  /\ holdEngaged \in BOOLEAN
  /\ dependentBatchAdmitted \in BOOLEAN
  /\ workflowWritesAvailable \in BOOLEAN
  /\ dependentBatchComplete \in BOOLEAN
  /\ snapshotClosed \in BOOLEAN

Init ==
  /\ physicalPhase = TargetProgress
  /\ durablePhase = DurableSending
  /\ durableStepTimedOut = FALSE
  /\ recoveryOwnerClaimed = FALSE
  /\ holdEngaged = TRUE
  /\ dependentBatchAdmitted = FALSE
  /\ workflowWritesAvailable = FALSE
  /\ dependentBatchComplete = FALSE
  /\ snapshotClosed = FALSE

(* Durable age makes recovery actionable. The mutant incorrectly treats the *)
(* same fact as permission for admission to release serialization.          *)
CrossDurableStepTimeout ==
  /\ ~durableStepTimedOut
  /\ durableStepTimedOut' = TRUE
  /\ holdEngaged' =
       IF TimeoutOnlyReleasesHold THEN FALSE ELSE holdEngaged
  /\ UNCHANGED << physicalPhase,
                  durablePhase,
                  recoveryOwnerClaimed,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  dependentBatchComplete,
                  snapshotClosed >>

(* Target creation/election continues while the durable ledger row remains *)
(* stuck at SENDING: owner progress and durable visibility are distinct.    *)
FinishTargetProgress ==
  /\ physicalPhase = TargetProgress
  /\ physicalPhase' = SourceProgress
  /\ UNCHANGED << durablePhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  holdEngaged,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  dependentBatchComplete,
                  snapshotClosed >>

(* Source removal completes the ledger surgery and restores progress writes, *)
(* but the authoritative workflow row may still lag until recovery publishes. *)
FinishSourceProgress ==
  /\ physicalPhase = SourceProgress
  /\ physicalPhase' = PhysicalDone
  /\ workflowWritesAvailable' = TRUE
  /\ UNCHANGED << durablePhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  holdEngaged,
                  dependentBatchAdmitted,
                  dependentBatchComplete,
                  snapshotClosed >>

(* Timeout belongs to the workflow recovery/reaper owner. Claiming recovery *)
(* does not itself release the hold or assert that physical work has stopped. *)
RecoveryOwnerClaimsTimedOutRow ==
  /\ durableStepTimedOut
  /\ durablePhase # DurableTerminal
  /\ ~recoveryOwnerClaimed
  /\ recoveryOwnerClaimed' = TRUE
  /\ UNCHANGED << physicalPhase,
                  durablePhase,
                  durableStepTimedOut,
                  holdEngaged,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  dependentBatchComplete,
                  snapshotClosed >>

(* The recovery owner supplies release evidence through its canonical terminal *)
(* transition after physical progress is reconciled.                         *)
RecoveryOwnerPublishesTerminal ==
  /\ recoveryOwnerClaimed
  /\ physicalPhase = PhysicalDone
  /\ durablePhase # DurableTerminal
  /\ durablePhase' = DurableTerminal
  /\ holdEngaged' = FALSE
  /\ UNCHANGED << physicalPhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  dependentBatchComplete,
                  snapshotClosed >>

AdmitDependentBatch ==
  /\ ~holdEngaged
  /\ ~dependentBatchAdmitted
  /\ dependentBatchAdmitted' = TRUE
  /\ UNCHANGED << physicalPhase,
                  durablePhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  holdEngaged,
                  workflowWritesAvailable,
                  dependentBatchComplete,
                  snapshotClosed >>

PersistDependentWorkflowRows ==
  /\ dependentBatchAdmitted
  /\ workflowWritesAvailable
  /\ ~dependentBatchComplete
  /\ dependentBatchComplete' = TRUE
  /\ UNCHANGED << physicalPhase,
                  durablePhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  holdEngaged,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  snapshotClosed >>

PublishClosedSnapshot ==
  /\ dependentBatchComplete
  /\ ~snapshotClosed
  /\ snapshotClosed' = TRUE
  /\ UNCHANGED << physicalPhase,
                  durablePhase,
                  durableStepTimedOut,
                  recoveryOwnerClaimed,
                  holdEngaged,
                  dependentBatchAdmitted,
                  workflowWritesAvailable,
                  dependentBatchComplete >>

SettledStutter ==
  /\ snapshotClosed
  /\ UNCHANGED vars

Next ==
  \/ CrossDurableStepTimeout
  \/ FinishTargetProgress
  \/ FinishSourceProgress
  \/ RecoveryOwnerClaimsTimedOutRow
  \/ RecoveryOwnerPublishesTerminal
  \/ AdmitDependentBatch
  \/ PersistDependentWorkflowRows
  \/ PublishClosedSnapshot
  \/ SettledStutter

Fairness ==
  /\ WF_vars(CrossDurableStepTimeout)
  /\ WF_vars(FinishTargetProgress)
  /\ WF_vars(FinishSourceProgress)
  /\ WF_vars(RecoveryOwnerClaimsTimedOutRow)
  /\ WF_vars(RecoveryOwnerPublishesTerminal)
  /\ WF_vars(AdmitDependentBatch)
  /\ WF_vars(PersistDependentWorkflowRows)
  /\ WF_vars(PublishClosedSnapshot)

Spec == Init /\ [][Next]_vars /\ Fairness

SerializationHoldReleaseRequiresAuthoritativeTerminal ==
  holdEngaged \/ durablePhase = DurableTerminal

DependentBatchNeverOverlapsLedgerSurgery ==
  ~dependentBatchAdmitted \/ physicalPhase = PhysicalDone

SnapshotClosureRequiresDurableWorkflowWrites ==
  ~snapshotClosed \/
    /\ dependentBatchComplete
    /\ workflowWritesAvailable

EventuallySnapshotClosed == <>snapshotClosed

=============================================================================
