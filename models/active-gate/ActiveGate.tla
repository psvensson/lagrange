---------------------------- MODULE ActiveGate ----------------------------
(***************************************************************************)
(* Phase B - TLA+ rendering of the active-gate / snapshot-coverage         *)
(* convergence protocol (Phase 0: models/active-gate/abstract-protocol.md). *)
(* The state variables and actions mirror exactly                          *)
(* models/active-gate/action-manifest.json; the executable fast-check      *)
(* model in test/model/active-gate renders the same machine, and the       *)
(* Phase D drift lint keeps the two surfaces in lockstep.                   *)
(*                                                                         *)
(* AllowUnboundedReentry selects the protocol variant:                     *)
(*   TRUE  -> the current protocol; EventuallyConverged is expected to     *)
(*           FAIL (TLC returns the oscillation as a liveness counterexample). *)
(*   FALSE -> the bounded-re-entry architecture route; EventuallyConverged *)
(*           holds under weak fairness of the progress actions.            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Nodes, AllowUnboundedReentry

VARIABLES pending, covered, published, fresh
vars == << pending, covered, published, fresh >>

Quorum == (Cardinality(Nodes) \div 2) + 1

TypeOK ==
  /\ pending \subseteq Nodes
  /\ covered \subseteq Nodes
  /\ published \subseteq Nodes
  /\ fresh \in BOOLEAN

Init ==
  /\ pending = Nodes
  /\ covered = {}
  /\ published = {}
  /\ fresh = TRUE

(* The green gate. published \subseteq covered is an invariant, so          *)
(* published = Nodes forces covered = Nodes >= Quorum.                       *)
Converged ==
  /\ Cardinality(Nodes) > 0
  /\ published = Nodes
  /\ Cardinality(covered) >= Quorum
  /\ fresh

(* ----- progress actions ------------------------------------------------ *)
ReconcileOwner(n) ==
  /\ n \in pending
  /\ pending' = pending \ {n}
  /\ UNCHANGED << covered, published, fresh >>

AdvanceSnapshotCoverage(n) ==
  /\ n \notin pending
  /\ n \notin covered
  /\ covered' = covered \cup {n}
  /\ UNCHANGED << pending, published, fresh >>

PublishNode(n) ==
  /\ n \notin pending
  /\ n \in covered
  /\ n \notin published
  /\ published' = published \cup {n}
  /\ UNCHANGED << pending, covered, fresh >>

RefreshSnapshot ==
  /\ fresh = FALSE
  /\ fresh' = TRUE
  /\ UNCHANGED << pending, covered, published >>

(* ----- regression actions (only under AllowUnboundedReentry) ----------- *)
DeferReentry(n) ==
  /\ AllowUnboundedReentry
  /\ n \notin pending
  /\ n \notin published
  /\ pending' = pending \cup {n}
  /\ covered' = covered \ {n}
  /\ UNCHANGED << published, fresh >>

StaleEvent ==
  /\ AllowUnboundedReentry
  /\ fresh = TRUE
  /\ fresh' = FALSE
  /\ UNCHANGED << pending, covered, published >>

(* A stuttering self-loop at the goal so the terminal green state is not    *)
(* reported as a deadlock; it does not affect <>Converged.                  *)
ConvergedStutter ==
  /\ Converged
  /\ UNCHANGED vars

Next ==
  \/ \E n \in Nodes : ReconcileOwner(n)
  \/ \E n \in Nodes : AdvanceSnapshotCoverage(n)
  \/ \E n \in Nodes : PublishNode(n)
  \/ RefreshSnapshot
  \/ \E n \in Nodes : DeferReentry(n)
  \/ StaleEvent
  \/ ConvergedStutter

(* Weak fairness of the progress actions only. The regression actions are   *)
(* deliberately unfair: an adversary may interleave them to keep a progress *)
(* action from being continuously enabled, which is exactly how the         *)
(* oscillation evades fairness in the stall configuration.                  *)
Fairness ==
  /\ \A n \in Nodes : WF_vars(ReconcileOwner(n))
  /\ \A n \in Nodes : WF_vars(AdvanceSnapshotCoverage(n))
  /\ \A n \in Nodes : WF_vars(PublishNode(n))
  /\ WF_vars(RefreshSnapshot)

Spec == Init /\ [][Next]_vars /\ Fairness

(* ----- safety ---------------------------------------------------------- *)
PublishedSubsetCovered == published \subseteq covered
CoveredDisjointPending == covered \cap pending = {}

(* ----- liveness -------------------------------------------------------- *)
EventuallyConverged == <>Converged
=============================================================================
