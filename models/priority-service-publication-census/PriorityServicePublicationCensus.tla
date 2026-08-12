---------------- MODULE PriorityServicePublicationCensus ----------------
(***************************************************************************)
(* One priority SERVICES row crosses three production owner transitions:  *)
(*                                                                         *)
(* 1. the lifecycle publisher creates the locally authoritative row;       *)
(* 2. the voter-readiness publisher adds its locally decided Raft role;    *)
(* 3. the later full-row lifecycle publisher replaces the row.             *)
(*                                                                         *)
(* The priority census derives readiness and exclusion counts from that    *)
(* row plus two already-ready baseline replicas. The fix preserves the     *)
(* foreign-owned raft_role during the full-row replacement. The mutant     *)
(* wipes it, reproducing the publication/census boundary failure where a   *)
(* real voter becomes census-invisible after having been briefly ready.    *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT PreserveVoterRoleOnLifecycleReplace

VARIABLES phase,
          rowPresent,
          status,
          raftRole,
          voterDecided

vars == <<phase, rowPresent, status, raftRole, voterDecided>>

Phases == {
  "absent",
  "lifecycle_published",
  "voter_published",
  "lifecycle_replaced"
}

Statuses == {"missing", "active"}
RaftRoles == {"missing", "follower"}

ExpectedReplicaCount == 3
BaselineReadyReplicaCount == 2

ObservedReplicaCount ==
  BaselineReadyReplicaCount + IF rowPresent THEN 1 ELSE 0

ReadyReplicaCount ==
  BaselineReadyReplicaCount +
    IF rowPresent /\ status = "active" /\ raftRole = "follower"
      THEN 1
      ELSE 0

RowAbsentCount == ExpectedReplicaCount - ObservedReplicaCount

RaftRoleMissingCount ==
  IF rowPresent /\ status = "active" /\ raftRole = "missing"
    THEN 1
    ELSE 0

CensusExpectedReplicaCount == ExpectedReplicaCount

CensusSatisfied == ReadyReplicaCount = ExpectedReplicaCount

TypeOK ==
  /\ PreserveVoterRoleOnLifecycleReplace \in BOOLEAN
  /\ phase \in Phases
  /\ rowPresent \in BOOLEAN
  /\ status \in Statuses
  /\ raftRole \in RaftRoles
  /\ voterDecided \in BOOLEAN
  /\ ObservedReplicaCount \in 0..ExpectedReplicaCount
  /\ ReadyReplicaCount \in 0..ExpectedReplicaCount
  /\ RowAbsentCount \in 0..ExpectedReplicaCount
  /\ RaftRoleMissingCount \in 0..ExpectedReplicaCount

Init ==
  /\ phase = "absent"
  /\ rowPresent = FALSE
  /\ status = "missing"
  /\ raftRole = "missing"
  /\ voterDecided = FALSE

(* ReplicaHandler.seedLocalPriorityServiceRow establishes lifecycle truth. *)
PublishLifecycleRow ==
  /\ phase = "absent"
  /\ phase' = "lifecycle_published"
  /\ rowPresent' = TRUE
  /\ status' = "active"
  /\ raftRole' = "missing"
  /\ UNCHANGED voterDecided

(* ReplicaHandler.seedLocalReplicaVoterRaftRole publishes the decided role. *)
PublishVoterRole ==
  /\ phase = "lifecycle_published"
  /\ phase' = "voter_published"
  /\ raftRole' = "follower"
  /\ voterDecided' = TRUE
  /\ UNCHANGED <<rowPresent, status>>

(* buildCreateCdcData emits the later full-row lifecycle replacement.      *)
PublishFullLifecycleReplacement ==
  /\ phase = "voter_published"
  /\ phase' = "lifecycle_replaced"
  /\ raftRole' = IF PreserveVoterRoleOnLifecycleReplace
                   THEN raftRole
                   ELSE "missing"
  /\ UNCHANGED <<rowPresent, status, voterDecided>>

TerminalStutter ==
  /\ phase = "lifecycle_replaced"
  /\ UNCHANGED vars

Next ==
  \/ PublishLifecycleRow
  \/ PublishVoterRole
  \/ PublishFullLifecycleReplacement
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(PublishLifecycleRow)
  /\ WF_vars(PublishVoterRole)
  /\ WF_vars(PublishFullLifecycleReplacement)

Spec == Init /\ [][Next]_vars /\ Fairness

(***************************************************************************)
(* Census contract. The restricted model has exactly two exclusion         *)
(* categories: an expected row is absent, or its published role is absent. *)
(***************************************************************************)
CensusExpectedCountMatchesAuthority ==
  /\ CensusExpectedReplicaCount = ExpectedReplicaCount
  /\ ObservedReplicaCount <= CensusExpectedReplicaCount
  /\ ReadyReplicaCount <= CensusExpectedReplicaCount

CensusAccountingComplete ==
  ReadyReplicaCount + RowAbsentCount + RaftRoleMissingCount =
    CensusExpectedReplicaCount

AbsentAndExcludedAreDisjoint ==
  ~(RowAbsentCount > 0 /\ RaftRoleMissingCount > 0)

CensusSatisfiedRequiresCompleteReadyPublication ==
  CensusSatisfied =>
    rowPresent /\ status = "active" /\ raftRole = "follower" /\ voterDecided

(* A bare <>CensusSatisfied is too weak: the role-wipe mutant is briefly    *)
(* ready before the final lifecycle replacement. Readiness must stabilize. *)
EventuallyStableCensusSatisfied == <>[](CensusSatisfied)

=============================================================================
