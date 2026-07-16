-------------------- MODULE IncrementalReplaceSpread --------------------
(***************************************************************************)
(* Serialized priority-REPLACE spread model.                               *)
(*                                                                         *)
(* A count-neutral REPLACE first makes its voter-ready target visible, then *)
(* removes one source. The operation-ledger self-move interlock permits only*)
(* one such workflow at a time. During cold formation, the first operation  *)
(* can preserve two-node spread while the final published target is three;  *)
(* after it terminalizes, a second serialized operation reaches three.      *)
(*                                                                         *)
(* RequireFinalTargetPerStep models the production bug: source removal is   *)
(* allowed only when this one operation already satisfies the eventual      *)
(* target. It strands the first operation at 2/3 and prevents the second.    *)
(* The fixed policy requires only non-regression per step.                   *)
(* AllowRegressingRemoval is an adversarial safety mutant used to prove the  *)
(* fixed liveness policy does not permit a spread-reducing removal.          *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS RequiredSpread,
          InitialSpread,
          RequireFinalTargetPerStep,
          AllowRegressingRemoval

VARIABLES spread,
          previousSpread,
          phase,
          candidateSpread,
          completedReplaces

vars == << spread, previousSpread, phase, candidateSpread, completedReplaces >>

Phases == {"idle", "target_ready"}

TypeOK ==
  /\ RequiredSpread \in Nat
  /\ RequiredSpread > 1
  /\ InitialSpread \in 1..RequiredSpread
  /\ spread \in 1..RequiredSpread
  /\ previousSpread \in 1..RequiredSpread
  /\ candidateSpread \in 1..RequiredSpread
  /\ phase \in Phases
  /\ completedReplaces \in Nat

Init ==
  /\ spread = InitialSpread
  /\ previousSpread = InitialSpread
  /\ phase = "idle"
  /\ candidateSpread = InitialSpread
  /\ completedReplaces = 0

(* One serialized workflow makes a voter-ready target visible. *)
StartReplace ==
  /\ phase = "idle"
  /\ spread < RequiredSpread
  /\ phase' = "target_ready"
  /\ candidateSpread' = spread + 1
  /\ UNCHANGED << spread, previousSpread, completedReplaces >>

(* Fixed completion: removing the source commits the non-regressing candidate.
 * The buggy toggle additionally demands final-target satisfaction now. *)
CompleteNonRegressing ==
  /\ phase = "target_ready"
  /\ (~RequireFinalTargetPerStep \/ candidateSpread >= RequiredSpread)
  /\ previousSpread' = spread
  /\ spread' = candidateSpread
  /\ phase' = "idle"
  /\ completedReplaces' = completedReplaces + 1
  /\ UNCHANGED candidateSpread

(* Safety mutant: a remove owner accepts a source removal that loses one
 * distinct voter-ready node while a safe alternative exists. *)
CompleteRegressing ==
  /\ AllowRegressingRemoval
  /\ phase = "target_ready"
  /\ spread > 1
  /\ previousSpread' = spread
  /\ spread' = spread - 1
  /\ phase' = "idle"
  /\ completedReplaces' = completedReplaces + 1
  /\ UNCHANGED candidateSpread

(* Intentional stutter exposes the final-target-per-step deadlock as a stable
 * state instead of relying on TLC deadlock checking. *)
WaitForImpossibleFinalTarget ==
  /\ phase = "target_ready"
  /\ RequireFinalTargetPerStep
  /\ candidateSpread < RequiredSpread
  /\ UNCHANGED vars

SettledStutter ==
  /\ spread = RequiredSpread
  /\ phase = "idle"
  /\ UNCHANGED vars

Next ==
  \/ StartReplace
  \/ CompleteNonRegressing
  \/ CompleteRegressing
  \/ WaitForImpossibleFinalTarget
  \/ SettledStutter

Fairness ==
  /\ WF_vars(StartReplace)
  /\ WF_vars(CompleteNonRegressing)

Spec == Init /\ [][Next]_vars /\ Fairness

(* Every open serialized operation retains an enabled completion owner. *)
OpenGapRetainsSerializedProgressOwner ==
  \/ spread = RequiredSpread
  \/ phase = "idle"
  \/ ~RequireFinalTargetPerStep
  \/ candidateSpread >= RequiredSpread

(* A completed source removal never reduces authoritative distinct-node spread. *)
SpreadNeverRegresses == spread >= previousSpread

EventuallyReachesPublishedTarget == <>(spread = RequiredSpread)

=============================================================================
