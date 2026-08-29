---------------- MODULE SplitCutoverHandoffClosure ----------------
EXTENDS Naturals, TLC

CONSTANTS Nodes, CleanupStatusOwnsRetirement

ASSUME Nodes # {}
ASSUME CleanupStatusOwnsRetirement \in {0, 1}

VARIABLES barriersInstalled,
          activeLeases,
          queryAcks,
          waitingPlans,
          sourceDeleted,
          transitionCleared

vars == <<barriersInstalled, activeLeases, queryAcks, waitingPlans,
          sourceDeleted, transitionCleared>>

TypeOK ==
  /\ barriersInstalled \subseteq Nodes
  /\ activeLeases \subseteq Nodes
  /\ queryAcks \subseteq Nodes
  /\ waitingPlans \subseteq Nodes
  /\ sourceDeleted \in BOOLEAN
  /\ transitionCleared \in BOOLEAN

Init ==
  /\ barriersInstalled = {}
  /\ activeLeases = Nodes
  /\ queryAcks = {}
  /\ waitingPlans = {}
  /\ sourceDeleted = FALSE
  /\ transitionCleared = FALSE

InstallBarrier(node) ==
  /\ ~sourceDeleted
  /\ node \in Nodes \ barriersInstalled
  /\ barriersInstalled' = barriersInstalled \cup {node}
  /\ UNCHANGED <<activeLeases, queryAcks, waitingPlans,
                  sourceDeleted, transitionCleared>>

FinishExistingLease(node) ==
  /\ node \in activeLeases
  /\ activeLeases' = activeLeases \ {node}
  /\ UNCHANGED <<barriersInstalled, queryAcks, waitingPlans,
                  sourceDeleted, transitionCleared>>

ArriveBehindBarrier(node) ==
  /\ ~sourceDeleted
  /\ node \in barriersInstalled
  /\ node \notin waitingPlans
  /\ waitingPlans' = waitingPlans \cup {node}
  /\ UNCHANGED <<barriersInstalled, activeLeases, queryAcks,
                  sourceDeleted, transitionCleared>>

AckQueryPlane(node) ==
  /\ ~sourceDeleted
  /\ node \in barriersInstalled
  /\ node \notin activeLeases
  /\ node \notin queryAcks
  /\ queryAcks' = queryAcks \cup {node}
  /\ UNCHANGED <<barriersInstalled, activeLeases, waitingPlans,
                  sourceDeleted, transitionCleared>>

DissolveAfterWholePlaneClosure ==
  /\ ~sourceDeleted
  /\ barriersInstalled = Nodes
  /\ activeLeases = {}
  /\ queryAcks = Nodes
  /\ sourceDeleted' = TRUE
  /\ UNCHANGED <<barriersInstalled, activeLeases, queryAcks,
                  waitingPlans, transitionCleared>>

DissolveFromCleanupStatus ==
  /\ CleanupStatusOwnsRetirement = 1
  /\ ~sourceDeleted
  /\ sourceDeleted' = TRUE
  /\ UNCHANGED <<barriersInstalled, activeLeases, queryAcks,
                  waitingPlans, transitionCleared>>

ClearTransition ==
  /\ sourceDeleted
  /\ ~transitionCleared
  /\ transitionCleared' = TRUE
  /\ UNCHANGED <<barriersInstalled, activeLeases, queryAcks,
                  waitingPlans, sourceDeleted>>

ReleaseWaitingPlans ==
  /\ transitionCleared
  /\ waitingPlans # {}
  /\ waitingPlans' = {}
  /\ UNCHANGED <<barriersInstalled, activeLeases, queryAcks,
                  sourceDeleted, transitionCleared>>

TerminalStutter ==
  /\ transitionCleared
  /\ waitingPlans = {}
  /\ UNCHANGED vars

Next ==
  \/ \E node \in Nodes: InstallBarrier(node)
  \/ \E node \in Nodes: FinishExistingLease(node)
  \/ \E node \in Nodes: ArriveBehindBarrier(node)
  \/ \E node \in Nodes: AckQueryPlane(node)
  \/ DissolveAfterWholePlaneClosure
  \/ DissolveFromCleanupStatus
  \/ ClearTransition
  \/ ReleaseWaitingPlans
  \/ TerminalStutter

Fairness ==
  /\ \A node \in Nodes: WF_vars(InstallBarrier(node))
  /\ \A node \in Nodes: WF_vars(FinishExistingLease(node))
  /\ \A node \in Nodes: WF_vars(AckQueryPlane(node))
  /\ WF_vars(DissolveAfterWholePlaneClosure)
  /\ WF_vars(DissolveFromCleanupStatus)
  /\ WF_vars(ClearTransition)
  /\ WF_vars(ReleaseWaitingPlans)

Spec == Init /\ [][Next]_vars /\ Fairness

NoDeletionBeforeWholePlaneClosed ==
  sourceDeleted =>
    barriersInstalled = Nodes /\ activeLeases = {} /\ queryAcks = Nodes

WaitingPlansRequireInstalledBarrier ==
  waitingPlans \subseteq barriersInstalled

TransitionClearFollowsDeletion == transitionCleared => sourceDeleted

EventuallyClosesAndReleases ==
  <> (sourceDeleted /\ transitionCleared /\ waitingPlans = {})
==================================================================
