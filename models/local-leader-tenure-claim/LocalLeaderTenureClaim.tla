---------------- MODULE LocalLeaderTenureClaim ----------------
(***************************************************************************)
(* Tenure-bound local leadership evidence during durable-publication lag   *)
(* (quest local-leadership-tenure-bound-safety-evidence).                   *)
(*                                                                          *)
(* A remove-safety read runs concurrently with leadership transitions: it   *)
(* captures cache evidence, awaits an authoritative read, then merges. The  *)
(* local node's election seeds the cached row; demotion and teardown clear  *)
(* the claim; an equal-version CDC replay can re-impose a FOSSIL row that   *)
(* NAMES this node without any live claim. The safety merge prefers local   *)
(* leadership evidence over a lagging authoritative row.                    *)
(*                                                                          *)
(* TenureBound = TRUE: the preference fires only while the live local       *)
(* tenure claim stands (stamped at election with its raft term, cleared on  *)
(* demotion/teardown, impossible for a replayed durable row to carry), and  *)
(* the merge consults the post-await cache state.                           *)
(* TenureBound = FALSE (the content-based mutant): the preference fires     *)
(* whenever the consulted row NAMES this node.                              *)
(*                                                                          *)
(* Invariant MergeNeverTrustsDeadTenure: the merged safety decision never   *)
(* reports this node as leader when its tenure is not live while the        *)
(* authoritative truth already names a successor. The mutant violates it    *)
(* via the fossil replay; the tenure-bound spec holds it.                   *)
(*                                                                          *)
(* Deliberately narrow: single partition, one safety read at a time, the    *)
(* irreducible not-yet-noticed-demotion window is out of scope (the local   *)
(* tenure is still formally live there; independent quorum floors bound it).*)
(***************************************************************************)
EXTENDS Naturals

CONSTANT TenureBound

Me == "me"
Successor == "successor"
OldLeader == "old"
NoLeader == "none"

Leaders == {Me, Successor, OldLeader, NoLeader}

VARIABLES
  tenureLive,          \* this node's live local claim (seeded by its election)
  cacheLeader,         \* leader named by the cached row
  cacheClaim,          \* whether the cached row carries the live-claim stamps
  authLeader,          \* leader named by the (possibly lagging) durable row
  readPhase,           \* "idle" / "inflight" / "done"
  mergedLeader,        \* the safety decision produced by the merge
  deadTenureOverride,  \* provenance: a merge preferred a DEAD local tenure
                       \* over an authoritative successor (the replay hazard)
  liveTenureIgnored    \* provenance: a merge ignored a LIVE stamped claim
                       \* (the recognition-tax regression)

vars == << tenureLive, cacheLeader, cacheClaim, authLeader, readPhase,
           mergedLeader, deadTenureOverride, liveTenureIgnored >>

TypeOK ==
  /\ tenureLive \in BOOLEAN
  /\ cacheLeader \in Leaders
  /\ cacheClaim \in BOOLEAN
  /\ authLeader \in Leaders
  /\ readPhase \in {"idle", "inflight", "done"}
  /\ mergedLeader \in Leaders
  /\ deadTenureOverride \in BOOLEAN
  /\ liveTenureIgnored \in BOOLEAN

Init ==
  /\ tenureLive = FALSE
  /\ cacheLeader = OldLeader
  /\ cacheClaim = FALSE
  /\ authLeader = OldLeader
  /\ readPhase = "idle"
  /\ mergedLeader = NoLeader
  /\ deadTenureOverride = FALSE
  /\ liveTenureIgnored = FALSE

\* This node wins an election: the seed stamps the claim onto the cache row.
WinElection ==
  /\ ~tenureLive
  /\ tenureLive' = TRUE
  /\ cacheLeader' = Me
  /\ cacheClaim' = TRUE
  /\ UNCHANGED << authLeader, readPhase, mergedLeader,
                  deadTenureOverride, liveTenureIgnored >>

\* Demotion or replica teardown: the claim is cleared synchronously; the
\* cached leader field is nulled (demotion) — claim stamps never survive.
LoseTenure ==
  /\ tenureLive
  /\ tenureLive' = FALSE
  /\ cacheLeader' = NoLeader
  /\ cacheClaim' = FALSE
  /\ UNCHANGED << authLeader, readPhase, mergedLeader,
                  deadTenureOverride, liveTenureIgnored >>

\* The durable successor publication lands in the authoritative store (it
\* may lag arbitrarily behind the local transitions).
SuccessorPublishes ==
  /\ authLeader' = Successor
  /\ UNCHANGED << tenureLive, cacheLeader, cacheClaim, readPhase,
                  mergedLeader, deadTenureOverride, liveTenureIgnored >>

\* The successor publication is CDC-delivered into the local cache: a
\* durable row can never carry claim stamps.
SuccessorReachesCache ==
  /\ authLeader = Successor
  /\ cacheLeader' = Successor
  /\ cacheClaim' = FALSE
  /\ UNCHANGED << tenureLive, authLeader, readPhase, mergedLeader,
                  deadTenureOverride, liveTenureIgnored >>

\* The replay window: after this node's tenure ended (claim cleared, maybe
\* the replica torn down), an equal-version CDC replay of an OLD durable row
\* naming this node re-imposes a FOSSIL — same name, no claim stamps.
ReplayFossil ==
  /\ ~tenureLive
  /\ cacheLeader' = Me
  /\ cacheClaim' = FALSE
  /\ UNCHANGED << tenureLive, authLeader, readPhase, mergedLeader,
                  deadTenureOverride, liveTenureIgnored >>

StartSafetyRead ==
  /\ readPhase = "idle"
  /\ readPhase' = "inflight"
  /\ UNCHANGED << tenureLive, cacheLeader, cacheClaim, authLeader,
                  mergedLeader, deadTenureOverride, liveTenureIgnored >>

\* The authoritative read returns and the merge runs. The landed hardening
\* consults the POST-AWAIT cache state (cacheLeader/cacheClaim), not the
\* pre-await capture. The preference for local leadership fires under
\* TenureBound only on a live stamped claim; under the content-based mutant
\* whenever the consulted row names this node.
PreferLocal ==
  IF TenureBound
  THEN cacheClaim /\ cacheLeader = Me /\ tenureLive
  ELSE cacheLeader = Me

FinishSafetyRead ==
  /\ readPhase = "inflight"
  /\ readPhase' = "done"
  /\ mergedLeader' = IF PreferLocal THEN Me ELSE authLeader
  \* Provenance recorded at the decision instant: post-decision transitions
  \* must not retroactively (in)validate the merge that already happened.
  /\ deadTenureOverride' = (deadTenureOverride \/ (PreferLocal /\ ~tenureLive /\ authLeader = Successor))
  /\ liveTenureIgnored' = (liveTenureIgnored \/ (~PreferLocal /\ tenureLive /\ cacheClaim /\ cacheLeader = Me))
  /\ UNCHANGED << tenureLive, cacheLeader, cacheClaim, authLeader >>

CompleteAndIdle ==
  /\ readPhase = "done"
  /\ readPhase' = "idle"
  /\ mergedLeader' = NoLeader
  /\ UNCHANGED << tenureLive, cacheLeader, cacheClaim, authLeader,
                  deadTenureOverride, liveTenureIgnored >>

Next ==
  \/ WinElection
  \/ LoseTenure
  \/ SuccessorPublishes
  \/ SuccessorReachesCache
  \/ ReplayFossil
  \/ StartSafetyRead
  \/ FinishSafetyRead
  \/ CompleteAndIdle

Spec == Init /\ [][Next]_vars

\* The safety decision must never prefer a DEAD local tenure over an
\* authoritative successor: exactly the fossil-replay override the tenure
\* binding exists to kill (provenance recorded at the decision instant).
MergeNeverTrustsDeadTenure == ~deadTenureOverride

\* The mechanism must not be silently disabled either: a LIVE stamped claim
\* is always preferred (the original recognition-tax fix stays effective).
LiveTenureIsPreferred == ~liveTenureIgnored

=============================================================================
