---------------- MODULE AcknowledgedWriteDurabilityVisibility ----------------
(***************************************************************************)
(* A successful rolling-restart INSERT moves through one safety-owned chain:*)
(* requested -> durable -> acknowledged -> restart -> recovered -> visible. *)
(*                                                                         *)
(* AllowAckBeforeDurability is the explicit mutant. When TRUE, the request  *)
(* can be acknowledged without a committed log identity or a receipt bound *)
(* to that identity. AcknowledgedRequiresDurability must reject that trace. *)
(***************************************************************************)
EXTENDS Naturals, TLC

CONSTANTS Nodes, AllowAckBeforeDurability

ASSUME Nodes # {}
ASSUME AllowAckBeforeDurability \in {0, 1}

VARIABLES phase,
          durable,
          acknowledged,
          commitWitness,
          receiptBound,
          restarted,
          recovered,
          visibleNodes

vars == <<phase, durable, acknowledged, commitWitness, receiptBound,
          restarted, recovered, visibleNodes>>

Phase == {"requested", "durable", "acknowledged", "restarted",
          "recovered", "visible"}

TypeOK ==
  /\ phase \in Phase
  /\ durable \in BOOLEAN
  /\ acknowledged \in BOOLEAN
  /\ commitWitness \in BOOLEAN
  /\ receiptBound \in BOOLEAN
  /\ restarted \in BOOLEAN
  /\ recovered \in BOOLEAN
  /\ visibleNodes \subseteq Nodes

Init ==
  /\ phase = "requested"
  /\ durable = FALSE
  /\ acknowledged = FALSE
  /\ commitWitness = FALSE
  /\ receiptBound = FALSE
  /\ restarted = FALSE
  /\ recovered = FALSE
  /\ visibleNodes = {}

CommitDurably ==
  /\ phase = "requested"
  /\ durable' = TRUE
  /\ commitWitness' = TRUE
  /\ phase' = "durable"
  /\ UNCHANGED <<acknowledged, receiptBound, restarted, recovered,
                  visibleNodes>>

AcknowledgeDurable ==
  /\ phase = "durable"
  /\ acknowledged' = TRUE
  /\ receiptBound' = TRUE
  /\ phase' = "acknowledged"
  /\ UNCHANGED <<durable, commitWitness, restarted, recovered, visibleNodes>>

AcknowledgeBeforeDurability ==
  /\ AllowAckBeforeDurability = 1
  /\ phase = "requested"
  /\ acknowledged' = TRUE
  /\ receiptBound' = FALSE
  /\ phase' = "acknowledged"
  /\ UNCHANGED <<durable, commitWitness, restarted, recovered, visibleNodes>>

Restart ==
  /\ phase = "acknowledged"
  /\ restarted' = TRUE
  /\ phase' = "restarted"
  /\ UNCHANGED <<durable, acknowledged, commitWitness, receiptBound,
                  recovered, visibleNodes>>

Recover ==
  /\ phase = "restarted"
  /\ durable
  /\ recovered' = TRUE
  /\ phase' = "recovered"
  /\ UNCHANGED <<durable, acknowledged, commitWitness, receiptBound,
                  restarted, visibleNodes>>

MakeVisible(node) ==
  /\ phase = "recovered"
  /\ node \in Nodes \ visibleNodes
  /\ visibleNodes' = visibleNodes \cup {node}
  /\ phase' = IF visibleNodes' = Nodes THEN "visible" ELSE "recovered"
  /\ UNCHANGED <<durable, acknowledged, commitWitness, receiptBound,
                  restarted, recovered>>

TerminalStutter ==
  /\ phase = "visible"
  /\ UNCHANGED vars

Next ==
  \/ CommitDurably
  \/ AcknowledgeDurable
  \/ AcknowledgeBeforeDurability
  \/ Restart
  \/ Recover
  \/ \E node \in Nodes: MakeVisible(node)
  \/ TerminalStutter

Fairness ==
  /\ WF_vars(CommitDurably)
  /\ WF_vars(AcknowledgeDurable)
  /\ WF_vars(AcknowledgeBeforeDurability)
  /\ WF_vars(Restart)
  /\ WF_vars(Recover)
  /\ \A node \in Nodes: WF_vars(MakeVisible(node))

Spec == Init /\ [][Next]_vars /\ Fairness

AcknowledgedRequiresDurability ==
  /\ acknowledged => durable /\ commitWitness /\ receiptBound
  /\ phase \in {"acknowledged", "restarted", "recovered", "visible"} =>
       durable /\ commitWitness /\ receiptBound

RestartPreservesDurability == restarted => durable /\ commitWitness

VisibilityRequiresRecovery == visibleNodes # {} => recovered

VisibleMeansEveryReachableNode ==
  phase = "visible" => visibleNodes = Nodes /\ acknowledged /\ durable

EventuallyVisibleEverywhere == <> (phase = "visible" /\ visibleNodes = Nodes)
=============================================================================
