------------------------- MODULE LeadershipFailback -------------------------
(***************************************************************************)
(* Rolling-restart LEADERSHIP-FAILBACK liveness model (CL-039).            *)
(*                                                                         *)
(* CL-039: the publication owner must be able to reach a live              *)
(* control_plane_publications-p1 WRITE-LEADER to close an OPEN epoch.      *)
(* During post-restart recovery a residual seed event-loop gap can exceed  *)
(* the raft election timeout; publications-p1 leadership then sheds off    *)
(* the stable seed onto the LAST-restarted replica, whose handler may not  *)
(* re-register. Because nothing transfers leadership BACK to the reachable *)
(* seed, the owner's epoch-advance upsert fails closed forever and the     *)
(* epoch stays OPEN -> a published node is counted missing -> STALLED.     *)
(*                                                                         *)
(* This is the lost-wakeup's leadership face, and it is a DIFFERENT state  *)
(* dimension than PublicationConvergence.tla (which has no leader location *)
(* at all). Per the plan's DT7 verification correction, CL-039 gets its    *)
(* own spec with an explicit leader-location variable + a fail-back action *)
(* rather than being forced onto the probe-bounded lost-wakeup shape.      *)
(*                                                                         *)
(* Abstract state:                                                         *)
(*   leader      \in {"seed", "restarting", "none"}                        *)
(*                  who holds control_plane_publications-p1 write-leadership.*)
(*   leaderLive  == the current leader is reachable AND its handler is     *)
(*                  registered, i.e. an epoch-advance upsert can commit.    *)
(*                  Only the seed is modelled as reliably live; a leader on *)
(*                  the restarting replica is NOT live (handler not        *)
(*                  re-registered -> DISTRIBUTED_PARTICIPANT_FAILURE).     *)
(*   epochOpen   == the latest publication epoch is OPEN (needs a write to  *)
(*                  a live leader to close to PUBLISHED).                   *)
(*   phase       == "recover" -> "closed".                                 *)
(*                                                                         *)
(* The fix is modelled as a single constant:                               *)
(*   FailBack (fix): an explicit, weakly-fair leadership transfer that      *)
(*                   moves publications-p1 write-leadership BACK to the     *)
(*                   reachable seed whenever it has stranded on a           *)
(*                   non-live (restarting) replica. Without it, leadership  *)
(*                   stranding is terminal and the epoch never closes.      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANT FailBack

VARIABLES leader,     \* "seed" | "restarting" | "none"
          epochOpen,  \* the latest publication epoch is OPEN
          phase       \* "recover" -> "closed"

vars == << leader, epochOpen, phase >>

Leaders == {"seed", "restarting", "none"}
Phase == {"recover", "closed"}

\* A leader can commit the epoch-advance write only when it is the seed: the
\* seed is reachable with a registered handler. Leadership on the restarting
\* replica is NOT live (post-restart handler never re-registers).
LeaderLive == leader = "seed"

TypeOK ==
  /\ leader \in Leaders
  /\ epochOpen \in BOOLEAN
  /\ phase \in Phase

\* Recovery starts with the seed holding leadership and the epoch OPEN (the
\* owner has raised an epoch to re-include the rejoined cohort but not closed
\* it yet).
Init ==
  /\ leader = "seed"
  /\ epochOpen = TRUE
  /\ phase = "recover"

(*-----------------------------------------------------------------------*)
(* Safety: the epoch only ever closes via a live leader (a write that      *)
(* actually committed). You can never be "closed" while still OPEN.        *)
(*-----------------------------------------------------------------------*)
ClosedImpliesNotOpen == (phase = "closed") => ~epochOpen

(*-----------------------------------------------------------------------*)
(* Actions.                                                               *)
(*-----------------------------------------------------------------------*)

\* The residual seed event-loop gap exceeds the election timeout and
\* publications-p1 leadership sheds off the seed onto the last-restarted
\* replica. Adversarial: nothing fair forces leadership to leave the seed,
\* but nothing forbids it either (CL-039 L1->L2, probabilistic in reality).
ShedToRestarting ==
  /\ leader = "seed"
  /\ epochOpen
  /\ leader' = "restarting"
  /\ UNCHANGED << epochOpen, phase >>

\* The owner's epoch-advance upsert: closes the OPEN epoch, but ONLY when the
\* current leader is live (the seed). When leadership has stranded on the
\* restarting replica this is DISABLED -> the write fails closed forever.
CloseEpoch ==
  /\ epochOpen
  /\ LeaderLive
  /\ epochOpen' = FALSE
  /\ UNCHANGED << leader, phase >>

\* Fail-back (the fix): an explicit, weakly-fair leadership transfer back to
\* the reachable seed whenever leadership has stranded on a non-live replica.
\* Enabled only when the fix is configured. This is the CL-039 binding lever:
\* a preferred-leader / leadership-transfer that returns write-leadership to a
\* node that can actually commit.
FailBackToSeed ==
  /\ FailBack
  /\ leader = "restarting"
  /\ leader' = "seed"
  /\ UNCHANGED << epochOpen, phase >>

\* Quiesce once the epoch has closed.
ReachClosed ==
  /\ phase = "recover"
  /\ ~epochOpen
  /\ phase' = "closed"
  /\ UNCHANGED << leader, epochOpen >>

ClosedStutter ==
  /\ phase = "closed"
  /\ UNCHANGED vars

Next ==
  \/ ShedToRestarting
  \/ CloseEpoch
  \/ FailBackToSeed
  \/ ReachClosed
  \/ ClosedStutter

(*-----------------------------------------------------------------------*)
(* Fairness.                                                              *)
(*                                                                        *)
(* The owner eventually closes the epoch once it CAN (CloseEpoch is weakly *)
(* fair), and eventually quiesces once closed. The fail-back transfer,     *)
(* when configured, is weakly fair: while leadership stays stranded on a   *)
(* non-live replica it eventually transfers back. CRUCIALLY there is NO    *)
(* fairness on ShedToRestarting -- the shed is adversarial -- so with no    *)
(* fail-back, a behaviour that sheds once and never recovers is fair and    *)
(* the epoch stays OPEN forever.                                           *)
(*-----------------------------------------------------------------------*)
\* CloseEpoch is STRONGLY fair: the owner's reconcile driver retries on every
\* ~5s tick, so whenever leadership is back on a live seed (CloseEpoch enabled),
\* it WILL attempt the close. Strong fairness = "enabled infinitely often =>
\* eventually fires", which is what beats an adversarial shed/fail-back ping-pong.
\* Weak fairness would be too weak (the shed repeatedly disables CloseEpoch).
Fairness ==
  /\ SF_vars(CloseEpoch)
  /\ WF_vars(ReachClosed)
  /\ WF_vars(FailBackToSeed)

Spec == Init /\ [][Next]_vars /\ Fairness

(*-----------------------------------------------------------------------*)
(* Correctness property.                                                 *)
(*                                                                        *)
(* The OPEN epoch must eventually close and the cluster quiesce.           *)
(*                                                                        *)
(* Without FailBack this FAILS: there is a fair behaviour in which         *)
(* leadership sheds to the restarting replica, CloseEpoch is permanently   *)
(* disabled (leader not live), and phase never leaves "recover" -- exactly *)
(* CL-039's "OPEN publication never closes / write fails closed forever".  *)
(* With FailBack it HOLDS: leadership transfers back to the live seed under *)
(* weak fairness, CloseEpoch becomes enabled, and the epoch closes.        *)
(*-----------------------------------------------------------------------*)
EventuallyClosed == <>(phase = "closed")

=============================================================================
