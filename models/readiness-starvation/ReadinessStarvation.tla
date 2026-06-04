------------------------ MODULE ReadinessStarvation ------------------------
(***************************************************************************)
(* Rolling-restart readiness STARVATION / priority-inversion model.        *)
(*                                                                         *)
(* This spec captures the live deadlock observed in the rolling-restart    *)
(* harness: a restarted node never quiesces because the work that would    *)
(* make it ready is gated on the readiness it is supposed to produce, and  *)
(* the high-priority recovery traffic that drives that work starves the    *)
(* transport lane whose readiness is the gate.                             *)
(*                                                                         *)
(* Empirical anchors (see session rr_findings + plan.md):                  *)
(*   queryReady   == routingReady, i.e. the query-message-group ingress    *)
(*                   transport readiness                                    *)
(*                   (src/bootstrap/shared/local-query-transport-readiness *)
(*                    .js:76-89 -> message-router-delivery-pressure-routing *)
(*                    .js:30-78). When UNAVAILABLE the harness reports      *)
(*                   "operational message-group ingress not ready".         *)
(*   spreadDone   == priority partitions spread + publication epoch         *)
(*                   advanced (runtimeAuthority: priority_partitions_not_   *)
(*                   spread, publication_epoch_pending).                    *)
(*   CritStorm    == the CRITICAL priority-recovery dispatch storm that     *)
(*                   pins the outbound queue at its bound (pending==48,     *)
(*                   100% critical) for as long as the node is not          *)
(*                   serve-eligible.                                        *)
(*                                                                         *)
(* Two candidate break-points are modelled as constants:                   *)
(*   ReserveQueryLane       (fix a): reserve transport headroom for the    *)
(*                          query-ingress lane so its readiness can flip    *)
(*                          even while the critical storm saturates the     *)
(*                          queue.                                          *)
(*   GateSpreadOnSelfReady  (the bug, fix b == FALSE): whether the node's   *)
(*                          own priority-recovery spread dispatch is gated  *)
(*                          on the node ALREADY being serve-eligible        *)
(*                          (target_node_not_ready, target == self). The    *)
(*                          bootstrap operation that PRODUCES readiness      *)
(*                          must not REQUIRE readiness.                     *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS ReserveQueryLane, GateSpreadOnSelfReady

VARIABLES queryReady,   \* routingReady / message-group ingress readiness
          spreadDone,   \* priority partitions spread + epoch advanced
          phase         \* "recover" -> "steady"

vars == << queryReady, spreadDone, phase >>

Phase == {"recover", "steady"}

TypeOK ==
  /\ queryReady \in BOOLEAN
  /\ spreadDone \in BOOLEAN
  /\ phase \in Phase

Init ==
  /\ queryReady = FALSE
  /\ spreadDone = FALSE
  /\ phase = "recover"

(*-----------------------------------------------------------------------*)
(* Derived readiness predicates (mirror the production dependency graph). *)
(*-----------------------------------------------------------------------*)

\* controlPlaneRecoveryEligible requires routingReady.
RecoveryEligible == queryReady

\* serveEligible requires routingReady AND the partition spread to be done.
ServeEligible == queryReady /\ spreadDone

\* The CRITICAL recovery dispatch storm is active for exactly as long as the
\* node is not serve-eligible: the node keeps retrying critical replica
\* dispatch (to peers and to itself) until it can serve.
CritStorm == ~ServeEligible

\* The query-ingress lane only gets transport admission when either the
\* critical storm is not saturating the queue, or a dedicated reserve exists.
QueryHeadroom == (~CritStorm) \/ ReserveQueryLane

\* The self-targeted spread dispatch (target == self) is gated on the target
\* being serve-eligible when GateSpreadOnSelfReady holds (the production bug).
SpreadGateOK == IF GateSpreadOnSelfReady THEN ServeEligible ELSE TRUE

(*-----------------------------------------------------------------------*)
(* Actions.                                                               *)
(*-----------------------------------------------------------------------*)

\* Flip query-message-group ingress readiness once the lane gets admission.
AdmitQueryIngress ==
  /\ ~queryReady
  /\ QueryHeadroom
  /\ queryReady' = TRUE
  /\ UNCHANGED << spreadDone, phase >>

\* Complete priority-partition spread once recovery is eligible and the
\* self-readiness gate (if any) is satisfied.
CompleteSpread ==
  /\ ~spreadDone
  /\ RecoveryEligible
  /\ SpreadGateOK
  /\ spreadDone' = TRUE
  /\ UNCHANGED << queryReady, phase >>

\* Quiesce once the node is serve-eligible.
ReachSteady ==
  /\ phase = "recover"
  /\ ServeEligible
  /\ phase' = "steady"
  /\ UNCHANGED << queryReady, spreadDone >>

SteadyStutter ==
  /\ phase = "steady"
  /\ UNCHANGED vars

Next ==
  \/ AdmitQueryIngress
  \/ CompleteSpread
  \/ ReachSteady
  \/ SteadyStutter

Fairness ==
  /\ WF_vars(AdmitQueryIngress)
  /\ WF_vars(CompleteSpread)
  /\ WF_vars(ReachSteady)

Spec == Init /\ [][Next]_vars /\ Fairness

(*-----------------------------------------------------------------------*)
(* Correctness properties.                                               *)
(*-----------------------------------------------------------------------*)

\* The system must always be able to quiesce: the restarted node eventually
\* becomes serve-eligible and reaches steady state. This FAILS (and TLC also
\* reports a hard deadlock) under any configuration that does not break BOTH
\* the transport-starvation cycle and the self-readiness gate cycle.
EventuallySteady == <>(phase = "steady")

=============================================================================
