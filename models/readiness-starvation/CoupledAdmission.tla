------------------------- MODULE CoupledAdmission -------------------------
(***************************************************************************)
(* Rolling-restart COUPLED-INVARIANT OSCILLATION model.                    *)
(*                                                                         *)
(* This spec captures the THIRD wedge the rolling-restart Quest hit once   *)
(* the readiness-starvation and publication-convergence deadlocks cleared: *)
(* the failure surface stopped being a single stuck invariant and became   *)
(* two DEFINITIONALLY COUPLED invariant families that bounce green<->red,  *)
(* each single-frontier patch flipping one family red as it greens the     *)
(* other. The Solver log records this directly as regression violations    *)
(* alternating between the two clusters (A -> B -> A):                      *)
(*                                                                         *)
(*   Cluster A == {publication_converged, priority_spread_settled}         *)
(*   Cluster B == {priority_recovery_*_requires_publication_convergence_    *)
(*                 and_priority_spread, ...} -- DEFINED in terms of A.      *)
(*                                                                         *)
(* Empirical anchor (solve/log/rolling-restart-core-stability.ndjson):     *)
(* eight regression violations all-time, alternating A,A,A,B,B,B,A,B. No    *)
(* single-frontier attempt ever held both families green at once because    *)
(* the green-range of A and the green-range of B overlap only at one        *)
(* reconciled operating point, and a frontier patch nudges the shared knob  *)
(* PAST that point toward whichever family is currently red.                *)
(*                                                                         *)
(* Abstraction. A shared scalar `knob` (the reconciled operating point of   *)
(* publication epoch + priority spread) drives both families:               *)
(*   A green  <=>  knob \in {1,2}                                           *)
(*   B green  <=>  knob \in {2,3}     (B requires the SAME settled state A   *)
(*                                     does, plus its own recovery gate)     *)
(*   both     <=>  knob = 2           (the single reconciled point)         *)
(* A single-frontier patch can only ever set the knob to its OWN family's    *)
(* local target (1 for A, 3 for B), never the shared point 2, so it greens   *)
(* one family and reds the other -- the oscillation.                        *)
(*                                                                         *)
(* The fix is modelled as a single constant:                               *)
(*   AtomicReconcile (fix): a whole-system reconcile -- the move a SYSTEM    *)
(*                   THEORY plus this model rung is meant to license -- that *)
(*                   sets the shared knob to the reconciled point 2 in one   *)
(*                   step, settling BOTH families together. A single-        *)
(*                   frontier patch cannot express this; the coupled theory  *)
(*                   can.                                                    *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT AtomicReconcile

VARIABLES knob,   \* shared reconciled operating point: publication epoch + spread
          phase   \* "recover" -> "steady"

vars == << knob, phase >>

Phase == {"recover", "steady"}
Knob == 0..3

AGreen == knob \in {1, 2}
BGreen == knob \in {2, 3}

TypeOK ==
  /\ knob \in Knob
  /\ phase \in Phase

\* Recovery starts with neither family settled (knob below both green ranges).
Init ==
  /\ knob = 0
  /\ phase = "recover"

(*-----------------------------------------------------------------------*)
(* Safety: the two coupled families are simultaneously green ONLY at the   *)
(* single reconciled operating point. This is the definitional coupling.   *)
(*-----------------------------------------------------------------------*)
CoupledOnlyAtReconciledPoint == (AGreen /\ BGreen) <=> (knob = 2)

(*-----------------------------------------------------------------------*)
(* Actions.                                                               *)
(*-----------------------------------------------------------------------*)

\* Single-frontier patch toward family A: greens A by snapping the shared
\* knob to A's local target, which overshoots B's range -> B goes red.
PatchTowardA ==
  /\ ~AGreen
  /\ knob' = 1
  /\ UNCHANGED phase

\* Single-frontier patch toward family B: greens B by snapping the shared
\* knob to B's local target, which undershoots A's range -> A goes red.
PatchTowardB ==
  /\ ~BGreen
  /\ knob' = 3
  /\ UNCHANGED phase

\* Whole-system reconcile (the fix): one move that lands the shared knob on
\* the reconciled point where BOTH families are green. Enabled only when the
\* coupled theory is configured.
AtomicReconcileAct ==
  /\ AtomicReconcile
  /\ knob # 2
  /\ knob' = 2
  /\ UNCHANGED phase

\* Quiesce once both coupled families are green together.
ReachSteady ==
  /\ phase = "recover"
  /\ AGreen /\ BGreen
  /\ phase' = "steady"
  /\ UNCHANGED knob

SteadyStutter ==
  /\ phase = "steady"
  /\ UNCHANGED vars

Next ==
  \/ PatchTowardA
  \/ PatchTowardB
  \/ AtomicReconcileAct
  \/ ReachSteady
  \/ SteadyStutter

(*-----------------------------------------------------------------------*)
(* Fairness.                                                              *)
(*                                                                        *)
(* The single-frontier patches and the quiesce step are weakly fair, so a  *)
(* live scheduler keeps trying. CRUCIALLY the only difference between the   *)
(* two configurations is whether the atomic reconcile EXISTS: when it does, *)
(* it is weakly fair and -- being continuously enabled while the knob is    *)
(* off the reconciled point -- must eventually fire, settling both families *)
(* despite the patches. Without it, the patches can only bounce the knob    *)
(* between 1 and 3 forever and the reconciled point is never reached.       *)
(*-----------------------------------------------------------------------*)
Fairness ==
  /\ WF_vars(PatchTowardA)
  /\ WF_vars(PatchTowardB)
  /\ WF_vars(AtomicReconcileAct)
  /\ WF_vars(ReachSteady)

Spec == Init /\ [][Next]_vars /\ Fairness

(*-----------------------------------------------------------------------*)
(* Correctness property.                                                  *)
(*                                                                        *)
(* Both coupled families must eventually settle together and the cohort    *)
(* reach steady state.                                                     *)
(*                                                                        *)
(* Without AtomicReconcile this FAILS: there is a fair behaviour in which   *)
(* PatchTowardA and PatchTowardB alternate forever (knob 1 <-> 3), neither  *)
(* family stays green, the reconciled point 2 is never reached, and phase   *)
(* never leaves "recover". With AtomicReconcile it HOLDS: the weakly-fair   *)
(* whole-system reconcile lands the knob on 2 regardless of the patches.    *)
(*-----------------------------------------------------------------------*)
EventuallySteady == <>(phase = "steady")

=============================================================================
