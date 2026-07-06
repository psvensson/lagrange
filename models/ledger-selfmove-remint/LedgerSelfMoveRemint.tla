----------------------- MODULE LedgerSelfMoveRemint -----------------------
(***************************************************************************)
(* Ledger self-move RE-MINT liveness model                                 *)
(* (quest formation-ledger-self-move-blocks-cluster-ops).                  *)
(*                                                                         *)
(* Live-demo ground truth (run-6, diagnose-run6-demo-stall.md): the        *)
(* priority ledger partition replica_operations-p1 has a count-NEUTRAL     *)
(* spread REPLACE self-move that must TERMINALIZE to de-concentrate the    *)
(* ledger and release the interlock (self_move_in_flight /                 *)
(* waiting_for_idle_ledger) that blocks every sibling control-plane        *)
(* partition. It never terminalizes: a severe leadership flap (raft term   *)
(* 2 -> 22, ~21 elections in ~5 min) makes each fresh leader RE-PLAN and   *)
(* RE-MINT the self-move, abandoning the in-flight operation's progress —   *)
(* the same replica is REPLACE'd to the same target 6x, 11x, ... without   *)
(* completing. The cluster stalls at demo stage [2/4].                      *)
(*                                                                         *)
(* This is a design-class LIVENESS bug (DT7): the docker demo can only     *)
(* fail to disprove it. TLC proves it — the bug is a fair behaviour whose   *)
(* self-move progress is reset by an unfair (adversarial) flap forever, and *)
(* the fix makes the liveness property hold.                                *)
(*                                                                         *)
(* Abstract state:                                                          *)
(*   progress \in 0..MaxSteps                                              *)
(*     the in-flight spread self-move's workflow progress toward its        *)
(*     terminal step (SENDING -> ... -> REMOVED). MaxSteps abstracts the    *)
(*     multi-step REPLACE workflow.                                         *)
(*   selfMove \in {"inflight", "terminal"}                                 *)
(*     whether the spread self-move has reached a terminal step (and thus   *)
(*     de-concentrated the ledger / released the interlock).                *)
(*   phase \in {"spreading", "settled"}                                    *)
(*     the cluster settles once the self-move terminalizes.                 *)
(*                                                                         *)
(* The fix is modelled as a single constant:                               *)
(*   IdempotentReplan (fix): a leadership change RECOGNISES the in-flight   *)
(*     self-move (authoritatively — the interlock's owner-RPC re-verify,    *)
(*     c7a3bf19) and CARRIES IT OVER instead of re-minting a duplicate, so  *)
(*     its progress is preserved across the election and it can terminalize.*)
(*     Without it, every election resets progress to 0 (re-mint) and the    *)
(*     self-move never completes.                                           *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS IdempotentReplan,  \* fix toggle: carry the in-flight self-move over a flap
          MaxSteps           \* abstract number of workflow steps to terminalize

VARIABLES progress,  \* 0..MaxSteps — the in-flight self-move's workflow progress
          selfMove,  \* "inflight" | "terminal"
          phase      \* "spreading" | "settled"

vars == << progress, selfMove, phase >>

SelfMoveState == {"inflight", "terminal"}
Phase == {"spreading", "settled"}

TypeOK ==
  /\ progress \in 0..MaxSteps
  /\ selfMove \in SelfMoveState
  /\ phase \in Phase

\* The cold-formation self-move has been minted and dispatched but not yet
\* terminalized; the cluster is still spreading (ledger concentrated).
Init ==
  /\ progress = 0
  /\ selfMove = "inflight"
  /\ phase = "spreading"

(*-----------------------------------------------------------------------*)
(* Safety: the cluster only reports settled once the self-move has         *)
(* actually terminalized (the interlock genuinely released).               *)
(*-----------------------------------------------------------------------*)
SettledImpliesTerminal == (phase = "settled") => (selfMove = "terminal")

(*-----------------------------------------------------------------------*)
(* Actions.                                                               *)
(*-----------------------------------------------------------------------*)

\* The workflow owner advances the in-flight self-move one step (SENDING ->
\* CATCHUP -> ... ). Weakly/strongly fair: the reconcile driver retries.
Advance ==
  /\ selfMove = "inflight"
  /\ progress < MaxSteps
  /\ progress' = progress + 1
  /\ UNCHANGED << selfMove, phase >>

\* The self-move reaches its terminal step: the ledger de-concentrates and the
\* interlock releases.
Terminalize ==
  /\ selfMove = "inflight"
  /\ progress = MaxSteps
  /\ selfMove' = "terminal"
  /\ UNCHANGED << progress, phase >>

\* Leadership FLAP (adversarial — NO fairness): a durability-fitness demotion /
\* re-election. A fresh leader re-plans. WITHOUT the fix it re-mints the
\* self-move, RESETTING its progress (the in-flight operation is abandoned).
\* WITH IdempotentReplan it recognises the in-flight self-move and carries its
\* progress over (no reset). Only meaningful while still in flight.
Flap ==
  /\ selfMove = "inflight"
  /\ IF IdempotentReplan
       THEN progress' = progress          \* carry the in-flight self-move over
       ELSE progress' = 0                 \* re-mint: abandon progress, start over
  /\ UNCHANGED << selfMove, phase >>

\* The cluster settles once the self-move has terminalized.
Settle ==
  /\ selfMove = "terminal"
  /\ phase = "spreading"
  /\ phase' = "settled"
  /\ UNCHANGED << progress, selfMove >>

SettledStutter ==
  /\ phase = "settled"
  /\ UNCHANGED vars

Next ==
  \/ Advance
  \/ Terminalize
  \/ Flap
  \/ Settle
  \/ SettledStutter

(*-----------------------------------------------------------------------*)
(* Fairness.                                                              *)
(*                                                                        *)
(* The workflow owner is STRONGLY fair on Advance: whenever advancing is   *)
(* enabled infinitely often it eventually advances (the reconcile driver   *)
(* retries every tick). Terminalize/Settle are weakly fair. CRUCIALLY the  *)
(* Flap has NO fairness — it is adversarial — so WITHOUT the fix a          *)
(* behaviour that re-mints (resets progress) after every single Advance is  *)
(* fair: Advance fires infinitely often yet progress oscillates 0<->1 and   *)
(* never reaches MaxSteps, so Terminalize is never enabled and the cluster  *)
(* never settles. That lasso IS the live limit cycle.                       *)
(*-----------------------------------------------------------------------*)
Fairness ==
  /\ SF_vars(Advance)
  /\ WF_vars(Terminalize)
  /\ WF_vars(Settle)

Spec == Init /\ [][Next]_vars /\ Fairness

(*-----------------------------------------------------------------------*)
(* Correctness property.                                                 *)
(*                                                                        *)
(* The spread self-move must eventually terminalize and the cluster settle.*)
(*                                                                        *)
(* Without IdempotentReplan this FAILS: an adversarial re-mint resets      *)
(* progress before it reaches MaxSteps, forever — exactly run-6's          *)
(* count-neutral REPLACE self-move re-minted on every leadership election. *)
(* With IdempotentReplan it HOLDS: progress is preserved across flaps, so   *)
(* under strong fairness on Advance it reaches MaxSteps, terminalizes, and  *)
(* the cluster settles.                                                     *)
(*-----------------------------------------------------------------------*)
EventuallySettled == <>(phase = "settled")

=============================================================================
