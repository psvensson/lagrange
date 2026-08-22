------------------- MODULE LedgerSpreadDrainRelease -------------------
(***************************************************************************)
(* Quest ledger-quorum-spread-hold-cure-drain-admission (doctrine s18;      *)
(* decision table operation-ledger-hold-engagement, invariant               *)
(* cure-planning-not-starved).                                              *)
(*                                                                         *)
(* An engaged operation-ledger quorum-spread hold withholds joiner READY    *)
(* leases while the ledger rests over target (the 2-1-1 surplus placement:  *)
(* voters 4, target 3, every distinct node occupied). The concentration     *)
(* owner mints a ledger_surplus_drain planning capability from that         *)
(* evidence. ConsumeOnlyAtZeroReady models the production bug: the move     *)
(* planner honored the capability only when the READY projection reported   *)
(* zero nodes, but the seed is always READY, so the drain was never planned *)
(* and the hold had no reachable release path. The fixed policy consumes    *)
(* the capability whenever minted; the drain completes, the hold            *)
(* disengages, and the joiner leases release. VotersNeverBelowTarget pins   *)
(* the safety floor in both configurations.                                 *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS TargetVoters,
          InitialVoters,
          ConsumeOnlyAtZeroReady

VARIABLES voters, readyNodes, capabilityMinted, drainInFlight

vars == << voters, readyNodes, capabilityMinted, drainInFlight >>

TypeOK ==
  /\ TargetVoters \in Nat /\ TargetVoters > 1
  /\ InitialVoters \in Nat /\ InitialVoters > TargetVoters
  /\ voters \in TargetVoters..InitialVoters
  /\ readyNodes \in 0..TargetVoters
  /\ capabilityMinted \in BOOLEAN
  /\ drainInFlight \in BOOLEAN

HoldEngaged == voters > TargetVoters

Init ==
  /\ voters = InitialVoters
  /\ readyNodes = 1
  /\ capabilityMinted = FALSE
  /\ drainInFlight = FALSE

(* The concentration owner mints the drain capability from surplus evidence. *)
MintCapability ==
  /\ HoldEngaged
  /\ ~capabilityMinted
  /\ capabilityMinted' = TRUE
  /\ UNCHANGED << voters, readyNodes, drainInFlight >>

(* The planner consumes the capability; the bug conditions consumption on a
   READY projection the engaged hold itself keeps at one (the seed). *)
CapabilityConsumable ==
  /\ capabilityMinted
  /\ (ConsumeOnlyAtZeroReady => readyNodes = 0)

PlanDrain ==
  /\ HoldEngaged
  /\ ~drainInFlight
  /\ CapabilityConsumable
  /\ drainInFlight' = TRUE
  /\ UNCHANGED << voters, readyNodes, capabilityMinted >>

CompleteDrain ==
  /\ drainInFlight
  /\ voters > TargetVoters
  /\ voters' = voters - 1
  /\ drainInFlight' = FALSE
  /\ capabilityMinted' = (voters - 1 > TargetVoters)
  /\ UNCHANGED readyNodes

(* Only a disengaged hold releases joiner READY leases. *)
ReleaseJoinerLeases ==
  /\ ~HoldEngaged
  /\ readyNodes < TargetVoters
  /\ readyNodes' = readyNodes + 1
  /\ UNCHANGED << voters, capabilityMinted, drainInFlight >>

Next ==
  \/ MintCapability
  \/ PlanDrain
  \/ CompleteDrain
  \/ ReleaseJoinerLeases

Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ WF_vars(MintCapability)
  /\ WF_vars(PlanDrain)
  /\ WF_vars(CompleteDrain)
  /\ WF_vars(ReleaseJoinerLeases)

(* Liveness: the engaged hold has a reachable release path. *)
HoldEventuallyReleases == <>(~HoldEngaged)

(* Liveness: the withheld joiner leases eventually release too. *)
JoinersEventuallyReady == <>(readyNodes = TargetVoters)

(* Safety floor: the drain never removes below the policy target. *)
VotersNeverBelowTarget == voters >= TargetVoters

=======================================================================
