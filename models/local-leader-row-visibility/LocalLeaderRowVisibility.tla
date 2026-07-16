-------------------- MODULE LocalLeaderRowVisibility --------------------
(***************************************************************************)
(* Focused Raft leader -> local canonical row -> durable row composition.  *)
(*                                                                         *)
(* The fixed owner exposes a won local election without waiting for the    *)
(* pressured durable lane, preserves the durable row's causal version,     *)
(* fences an in-flight publish after demotion, and clears delayed durable  *)
(* self-publication replay while preserving a different successor.         *)
(*                                                                         *)
(* This is a deliberately narrow cross-layer proof, not exhaustive formal  *)
(* coverage of every repository interaction.                               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS SeedOnElection,
          PreserveLocalVersion,
          ClearOnDemotion,
          RecheckBeforeWrite,
          ClearDemotedReplay,
          AllowDemotion

NoLeader == "none"
Source == "source"
Replacement == "replacement"
Successor == "successor"
LeaderValues == {NoLeader, Source, Replacement, Successor}

VARIABLES raftLeader,
          localRowLeader,
          localRowVersion,
          durableRowLeader,
          durableRowVersion,
          durablePublishPending,
          authoritativeReadInFlight,
          replacementVoterReady,
          demotionObserved,
          replayAfterDemotionObserved,
          successorDeliveryObserved,
          sourceRemovalObserved,
          unsafeRemovalObserved

vars == << raftLeader,
           localRowLeader,
           localRowVersion,
           durableRowLeader,
           durableRowVersion,
           durablePublishPending,
           authoritativeReadInFlight,
           replacementVoterReady,
           demotionObserved,
           replayAfterDemotionObserved,
           successorDeliveryObserved,
           sourceRemovalObserved,
           unsafeRemovalObserved >>

TypeOK ==
  /\ raftLeader \in LeaderValues
  /\ localRowLeader \in LeaderValues
  /\ localRowVersion \in 1..3
  /\ durableRowLeader \in LeaderValues
  /\ durableRowVersion \in 1..2
  /\ durablePublishPending \in BOOLEAN
  /\ authoritativeReadInFlight \in BOOLEAN
  /\ replacementVoterReady \in BOOLEAN
  /\ demotionObserved \in BOOLEAN
  /\ replayAfterDemotionObserved \in BOOLEAN
  /\ successorDeliveryObserved \in BOOLEAN
  /\ sourceRemovalObserved \in BOOLEAN
  /\ unsafeRemovalObserved \in BOOLEAN

Init ==
  /\ raftLeader = Source
  /\ localRowLeader = Source
  /\ localRowVersion = 1
  /\ durableRowLeader = Source
  /\ durableRowVersion = 1
  /\ durablePublishPending = FALSE
  /\ authoritativeReadInFlight = FALSE
  /\ replacementVoterReady = TRUE
  /\ demotionObserved = FALSE
  /\ replayAfterDemotionObserved = FALSE
  /\ successorDeliveryObserved = FALSE
  /\ sourceRemovalObserved = FALSE
  /\ unsafeRemovalObserved = FALSE

ElectReplacement ==
  /\ raftLeader = Source
  /\ raftLeader' = Replacement
  /\ localRowLeader' =
       IF SeedOnElection THEN Replacement ELSE localRowLeader
  /\ localRowVersion' =
       IF SeedOnElection /\ ~PreserveLocalVersion THEN 3 ELSE localRowVersion
  /\ durablePublishPending' = TRUE
  /\ UNCHANGED << durableRowLeader,
                  durableRowVersion,
                  authoritativeReadInFlight,
                  replacementVoterReady,
                  demotionObserved,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

StartAuthoritativeRead ==
  /\ durablePublishPending
  /\ ~authoritativeReadInFlight
  /\ raftLeader = Replacement
  /\ authoritativeReadInFlight' = TRUE
  /\ UNCHANGED << raftLeader,
                  localRowLeader,
                  localRowVersion,
                  durableRowLeader,
                  durableRowVersion,
                  durablePublishPending,
                  replacementVoterReady,
                  demotionObserved,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

SubmitDurablePublish ==
  /\ authoritativeReadInFlight
  /\ (~RecheckBeforeWrite \/ raftLeader = Replacement)
  /\ durableRowLeader' = Replacement
  /\ durableRowVersion' = 2
  /\ localRowLeader' = Replacement
  /\ localRowVersion' = 2
  /\ durablePublishPending' = FALSE
  /\ authoritativeReadInFlight' = FALSE
  /\ UNCHANGED << raftLeader,
                  replacementVoterReady,
                  demotionObserved,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

DemoteReplacement ==
  /\ AllowDemotion
  /\ raftLeader = Replacement
  /\ raftLeader' = NoLeader
  /\ localRowLeader' =
       IF ClearOnDemotion /\ localRowLeader = Replacement
       THEN NoLeader
       ELSE localRowLeader
  /\ durablePublishPending' = FALSE
  /\ demotionObserved' = TRUE
  /\ UNCHANGED << localRowVersion,
                  durableRowLeader,
                  durableRowVersion,
                  authoritativeReadInFlight,
                  replacementVoterReady,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

AbortDemotedPublish ==
  /\ authoritativeReadInFlight
  /\ RecheckBeforeWrite
  /\ raftLeader # Replacement
  /\ authoritativeReadInFlight' = FALSE
  /\ durablePublishPending' = FALSE
  /\ UNCHANGED << raftLeader,
                  localRowLeader,
                  localRowVersion,
                  durableRowLeader,
                  durableRowVersion,
                  replacementVoterReady,
                  demotionObserved,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

(* A durable self row committed before demotion can be delivered again at the
 * same causal version. The fixed cache listener retains bounded demotion
 * provenance and conditionally clears this node only. *)
ReplayDurableSelfAfterDemotion ==
  /\ demotionObserved
  /\ ~replayAfterDemotionObserved
  /\ raftLeader # Replacement
  /\ durableRowLeader = Replacement
  /\ localRowLeader = NoLeader
  /\ localRowLeader' =
       IF ClearDemotedReplay THEN NoLeader ELSE Replacement
  /\ localRowVersion' = durableRowVersion
  /\ replayAfterDemotionObserved' = TRUE
  /\ UNCHANGED << raftLeader,
                  durableRowLeader,
                  durableRowVersion,
                  durablePublishPending,
                  authoritativeReadInFlight,
                  replacementVoterReady,
                  demotionObserved,
                  successorDeliveryObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

(* The successor's durable version 2 is newer than the pre-election base row
 * version 1 even when its physical clock trails the election observer. A
 * locally minted version 3 incorrectly fences that legitimate successor. *)
DeliverSuccessorPublication ==
  /\ raftLeader = Replacement
  /\ ~successorDeliveryObserved
  /\ raftLeader' = NoLeader
  /\ durableRowLeader' = Successor
  /\ durableRowVersion' = 2
  /\ localRowLeader' =
       IF 2 < localRowVersion THEN localRowLeader ELSE Successor
  /\ localRowVersion' =
       IF 2 < localRowVersion THEN localRowVersion ELSE 2
  /\ durablePublishPending' = FALSE
  /\ demotionObserved' = TRUE
  /\ successorDeliveryObserved' = TRUE
  /\ UNCHANGED << authoritativeReadInFlight,
                  replacementVoterReady,
                  replayAfterDemotionObserved,
                  sourceRemovalObserved,
                  unsafeRemovalObserved >>

ObserveSourceRemoval ==
  /\ ~sourceRemovalObserved
  /\ replacementVoterReady
  /\ localRowLeader = Replacement
  /\ sourceRemovalObserved' = TRUE
  /\ unsafeRemovalObserved' = (raftLeader # Replacement)
  /\ UNCHANGED << raftLeader,
                  localRowLeader,
                  localRowVersion,
                  durableRowLeader,
                  durableRowVersion,
                  durablePublishPending,
                  authoritativeReadInFlight,
                  replacementVoterReady,
                  demotionObserved,
                  replayAfterDemotionObserved,
                  successorDeliveryObserved >>

SettledStutter ==
  /\ sourceRemovalObserved \/ raftLeader = NoLeader
  /\ UNCHANGED vars

Next ==
  \/ ElectReplacement
  \/ StartAuthoritativeRead
  \/ SubmitDurablePublish
  \/ DemoteReplacement
  \/ AbortDemotedPublish
  \/ ReplayDurableSelfAfterDemotion
  \/ DeliverSuccessorPublication
  \/ ObserveSourceRemoval
  \/ SettledStutter

Fairness ==
  /\ WF_vars(ElectReplacement)
  /\ WF_vars(StartAuthoritativeRead)
  /\ WF_vars(SubmitDurablePublish)
  /\ WF_vars(AbortDemotedPublish)

Spec == Init /\ [][Next]_vars /\ Fairness

LocalLeaderHasImmediateEvidence ==
  raftLeader # Replacement \/ localRowLeader = Replacement

DemotedLeaderCannotAuthorizeRemoval == ~unsafeRemovalObserved

SuccessorPublicationWins ==
  ~successorDeliveryObserved \/ localRowLeader = Successor

EventuallyLocalLeaderVisible ==
  <>(raftLeader = Replacement /\ localRowLeader = Replacement)

DurableConvergesOrOwnershipChanges ==
  [](raftLeader = Replacement =>
       <>(durableRowLeader = Replacement \/ raftLeader # Replacement))

=============================================================================
