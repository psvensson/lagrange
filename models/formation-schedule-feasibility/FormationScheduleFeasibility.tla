---------------- MODULE FormationScheduleFeasibility ----------------
(***************************************************************************)
(* Formation-schedule feasibility against the schema-admission gate        *)
(* (quest formation-priority-spread-without-exclusive-self-move-cost;      *)
(* parent formation-ledger-self-move-blocks-cluster-ops).                   *)
(*                                                                          *)
(* Cold formation must run a set of cure jobs before the admission gate     *)
(* can certify quiescence. Ledger self-moves are EXCLUSIVE: while one runs, *)
(* no other job may START (the ledger interlock — operations' own durable   *)
(* rows write through the partition under surgery). Spread jobs run in      *)
(* parallel up to a concurrency budget. The gate admits only when all jobs  *)
(* are done and the system has been quiet for StableWindow consecutive      *)
(* ticks, all within Budget ticks of the gate opening.                      *)
(*                                                                          *)
(* This is a FEASIBILITY model: the scheduler is nondeterministic, so TLC   *)
(* explores every admissible schedule. "Admitted is unreachable" checked as *)
(* an invariant means NO schedule satisfies the gate (the current profile); *)
(* an invariant VIOLATION is a concrete feasibility witness schedule (the   *)
(* candidate mechanisms). One tick abstracts ~10 seconds of the measured    *)
(* 2026-07-16T21:52 run.                                                    *)
(*                                                                          *)
(* Deliberately narrow: durations are constants from measured data; the     *)
(* model does not represent raft, safety predicates, or the interlock's     *)
(* correctness — only the schedule arithmetic those mechanisms impose.      *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

\* @@ (function merge) lives in TLC's standard module in some distributions;
\* define the two-entry extension explicitly to stay distribution-independent.
Extend(fn, key, value) ==
  [x \in (DOMAIN fn) \union {key} |->
    IF x = key THEN value ELSE fn[x]]

CONSTANTS
  \* Number of exclusive ledger self-moves formation must run (current: 2;
  \* mechanism (c): 1; mechanism (a) join-time placement: 0).
  SelfMoveCount,
  \* Ticks each self-move holds the exclusive interlock (measured ~5/tick=10s).
  SelfMoveDurationTicks,
  \* Parallel spread-wave jobs (non-ledger priority partitions) and duration.
  SpreadJobCount,
  SpreadDurationTicks,
  \* Max spread jobs running concurrently (observed wave width).
  SpreadConcurrency,
  \* Ticks of pre-gate headroom: jobs may start this many ticks before the
  \* admission window opens (mechanism (b); current: 0).
  PreGateHeadroomTicks,
  \* Gate: total budget and required consecutive quiet ticks, measured from
  \* the tick the admission window opens.
  BudgetTicks,
  StableWindowTicks

ASSUME SelfMoveCount \in Nat
ASSUME SpreadJobCount \in Nat /\ SpreadJobCount >= 1
ASSUME SpreadConcurrency \in Nat /\ SpreadConcurrency >= 1

SelfMoves == {<<"self", i>> : i \in 1..SelfMoveCount}
SpreadJobs == {<<"spread", i>> : i \in 1..SpreadJobCount}
Jobs == SelfMoves \union SpreadJobs

IsSelfMove(job) == job[1] = "self"

DurationOf(job) ==
  IF IsSelfMove(job) THEN SelfMoveDurationTicks ELSE SpreadDurationTicks

VARIABLES
  clock,          \* ticks since jobs were first allowed to start
  remaining,      \* job -> remaining ticks (0 = done); absent from running
  running,        \* job -> ticks left
  quietTicks,     \* consecutive quiet ticks observed by the gate
  admitted

vars == <<clock, remaining, running, quietTicks, admitted>>

GateClock == IF clock >= PreGateHeadroomTicks
             THEN clock - PreGateHeadroomTicks
             ELSE 0
GateOpen == clock >= PreGateHeadroomTicks

Pending == {job \in Jobs : remaining[job] > 0 /\ job \notin DOMAIN running}
AllDone == /\ Pending = {}
           /\ DOMAIN running = {}

RunningSelfMoves == {job \in DOMAIN running : IsSelfMove(job)}
RunningSpread == {job \in DOMAIN running : ~IsSelfMove(job)}

\* The exclusive interlock: nothing may START while a self-move runs, and a
\* self-move may only START into an idle system.
MayStart(job) ==
  /\ RunningSelfMoves = {}
  /\ IF IsSelfMove(job)
     THEN DOMAIN running = {}
     ELSE Cardinality(RunningSpread) < SpreadConcurrency

TypeOK ==
  /\ clock \in Nat
  /\ quietTicks \in Nat
  /\ admitted \in BOOLEAN

Init ==
  /\ clock = 0
  /\ remaining = [job \in Jobs |-> DurationOf(job)]
  /\ running = <<>>
  /\ quietTicks = 0
  /\ admitted = FALSE

StartJob(job) ==
  /\ ~admitted
  /\ job \in Pending
  /\ MayStart(job)
  /\ running' = Extend(running, job, remaining[job])
  /\ UNCHANGED <<clock, remaining, quietTicks, admitted>>

Quiet == DOMAIN running = {}

\* One tick passes: running jobs progress; finished jobs leave; the gate
\* accumulates quiet ticks only while open, quiet, and all work done.
Tick ==
  /\ ~admitted
  \* Bound the state space: once the budget is spent the schedule question is
  \* settled and only Done stutters.
  /\ GateClock <= BudgetTicks
  /\ clock' = clock + 1
  /\ running' =
       [job \in {r \in DOMAIN running : running[r] > 1} |->
         running[job] - 1]
  /\ remaining' =
       [job \in Jobs |->
         IF job \in DOMAIN running /\ running[job] = 1
         THEN 0
         ELSE remaining[job]]
  /\ quietTicks' =
       IF GateOpen /\ Quiet /\ Pending = {}
       THEN quietTicks + 1
       ELSE 0
  /\ UNCHANGED admitted

Admit ==
  /\ ~admitted
  /\ GateOpen
  /\ AllDone
  /\ quietTicks >= StableWindowTicks
  /\ GateClock <= BudgetTicks
  /\ admitted' = TRUE
  /\ UNCHANGED <<clock, remaining, running, quietTicks>>

\* The budget can expire; after that Admit is unreachable and the model may
\* stutter (feasibility is a reachability question, not liveness).
Done ==
  /\ (admitted \/ GateClock > BudgetTicks)
  /\ UNCHANGED vars

Next ==
  \/ \E job \in Jobs : StartJob(job)
  \/ Tick
  \/ Admit
  \/ Done

Spec == Init /\ [][Next]_vars

\* Feasibility oracle: TLC checking this INVARIANT proves, when it HOLDS,
\* that no schedule admits (infeasible profile); a VIOLATION is a concrete
\* witness schedule proving feasibility.
NeverAdmitted == ~admitted

\* Sanity: the gate never admits with work outstanding or a short window.
AdmissionIsHonest ==
  admitted =>
    /\ AllDone
    /\ quietTicks >= StableWindowTicks

=============================================================================
