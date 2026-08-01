---------------- MODULE DurableRejoinFormationBarrier ----------------
(***************************************************************************)
(* Startup-mode admission for the operation-ledger cold-formation barrier. *)
(*                                                                         *)
(* A fresh or unknown join with a sufficient pre-ready cohort must wait for *)
(* operation-ledger spread. A durable rejoin is an existing member reentry, *)
(* not formation; peer ready-lease quarantine must not latch that barrier.  *)
(* RespectDurableRejoinIdentity selects the runtime correction. Turning it   *)
(* off reproduces the rolling-restart misclassification.                    *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS StartupMode,
          RespectDurableRejoinIdentity,
          PeerPreReadyCount,
          FormationWaveNodeCount,
          MaxWaitTicks

ASSUME StartupMode \in {"fresh_join", "durable_rejoin", "unknown"}
ASSUME RespectDurableRejoinIdentity \in BOOLEAN
ASSUME PeerPreReadyCount \in Nat
ASSUME FormationWaveNodeCount \in Nat
ASSUME MaxWaitTicks \in Nat

VARIABLES phase,
          ledgerSpreadComplete,
          waitTicks

vars == <<phase, ledgerSpreadComplete, waitTicks>>

Phase == {"unclassified", "formation_wait", "ready", "formation_timeout"}
Terminal == phase \in {"ready", "formation_timeout"}

FormationCohortPresent ==
  PeerPreReadyCount >= FormationWaveNodeCount

FormationBarrierEligible ==
  StartupMode # "durable_rejoin" \/ ~RespectDurableRejoinIdentity

TypeOK ==
  /\ phase \in Phase
  /\ ledgerSpreadComplete \in BOOLEAN
  /\ waitTicks \in 0..MaxWaitTicks

Init ==
  /\ phase = "unclassified"
  /\ ledgerSpreadComplete = FALSE
  /\ waitTicks = 0

ClassifyStartup ==
  /\ phase = "unclassified"
  /\ phase' =
       IF FormationCohortPresent /\ FormationBarrierEligible
       THEN "formation_wait"
       ELSE "ready"
  /\ UNCHANGED <<ledgerSpreadComplete, waitTicks>>

(* Only an actual formation lane can cure formation spread in this model. *)
ObserveFormationSpread ==
  /\ phase = "formation_wait"
  /\ StartupMode # "durable_rejoin"
  /\ ledgerSpreadComplete = FALSE
  /\ ledgerSpreadComplete' = TRUE
  /\ UNCHANGED <<phase, waitTicks>>

ReleaseFormation ==
  /\ phase = "formation_wait"
  /\ ledgerSpreadComplete
  /\ phase' = "ready"
  /\ UNCHANGED <<ledgerSpreadComplete, waitTicks>>

TickFormationWait ==
  /\ phase = "formation_wait"
  /\ ~ledgerSpreadComplete
  /\ waitTicks < MaxWaitTicks
  /\ waitTicks' = waitTicks + 1
  /\ UNCHANGED <<phase, ledgerSpreadComplete>>

TimeoutFormationWait ==
  /\ phase = "formation_wait"
  /\ ~ledgerSpreadComplete
  /\ waitTicks = MaxWaitTicks
  /\ phase' = "formation_timeout"
  /\ UNCHANGED <<ledgerSpreadComplete, waitTicks>>

TerminalStutter ==
  /\ Terminal
  /\ UNCHANGED vars

Next ==
  \/ ClassifyStartup
  \/ ObserveFormationSpread
  \/ ReleaseFormation
  \/ TickFormationWait
  \/ TimeoutFormationWait
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(ClassifyStartup)
  /\ WF_vars(ObserveFormationSpread)
  /\ WF_vars(ReleaseFormation)
  /\ WF_vars(TickFormationWait)
  /\ WF_vars(TimeoutFormationWait)

Spec == Init /\ [][Next]_vars /\ Fairness

DurableRejoinNeverWaitsOnFormation ==
  StartupMode = "durable_rejoin" =>
    phase \notin {"formation_wait", "formation_timeout"}

FreshFormationNeverReadyBeforeSpread ==
  StartupMode # "durable_rejoin" /\
  FormationCohortPresent /\
  phase = "ready" => ledgerSpreadComplete

EventuallyTerminal == <>Terminal
=============================================================================
