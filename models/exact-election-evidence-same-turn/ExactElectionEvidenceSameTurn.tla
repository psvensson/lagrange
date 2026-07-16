---------------- MODULE ExactElectionEvidenceSameTurn ----------------
(***************************************************************************)
(* Focused target-election response -> evidence -> continuation -> remove  *)
(* safety -> serialized source-removal composition.                        *)
(*                                                                         *)
(* The continuation owner routes an exact COMPLETED acknowledgment; it     *)
(* never owns removal authorization. Retry expiry is enabled only in the   *)
(* wait state, so fixed same-turn routing reaches canonical safety before  *)
(* an alternate target can replace the exact evidence.                     *)
(*                                                                         *)
(* This is deliberately narrow cross-layer proof, not exhaustive formal   *)
(* coverage of every repository interaction.                              *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS ContinueExactEvidenceSameTurn,
          ContinuationOwnsAuthorization

Dispatch == "dispatch"
Continuation == "continuation"
Wait == "wait"
Safety == "safety"
Blocked == "blocked"
Removed == "removed"
Retargeted == "retargeted"
Phases == {Dispatch, Continuation, Wait, Safety, Blocked, Removed, Retargeted}

NoOwner == "none"
ContinuationOwner == "continuation"
CanonicalSafetyOwner == "canonical_safety"
AuthorizationOwners == {NoOwner, ContinuationOwner, CanonicalSafetyOwner}

VARIABLES phase,
          exactCompletedEvidence,
          notFoundEvidence,
          retryExpired,
          voterReady,
          quorumSafe,
          membershipSafe,
          leadershipSafe,
          peerReachable,
          interlockAvailable,
          interlockHeld,
          authorizationOwner,
          sourceRemoved,
          alternateTargetSelected

vars == << phase,
           exactCompletedEvidence,
           notFoundEvidence,
           retryExpired,
           voterReady,
           quorumSafe,
           membershipSafe,
           leadershipSafe,
           peerReachable,
           interlockAvailable,
           interlockHeld,
           authorizationOwner,
           sourceRemoved,
           alternateTargetSelected >>

AllCanonicalGuardsReady ==
  voterReady /\
  quorumSafe /\
  membershipSafe /\
  leadershipSafe /\
  peerReachable /\
  interlockAvailable

TypeOK ==
  /\ phase \in Phases
  /\ exactCompletedEvidence \in BOOLEAN
  /\ notFoundEvidence \in BOOLEAN
  /\ retryExpired \in BOOLEAN
  /\ voterReady \in BOOLEAN
  /\ quorumSafe \in BOOLEAN
  /\ membershipSafe \in BOOLEAN
  /\ leadershipSafe \in BOOLEAN
  /\ peerReachable \in BOOLEAN
  /\ interlockAvailable \in BOOLEAN
  /\ interlockHeld \in BOOLEAN
  /\ authorizationOwner \in AuthorizationOwners
  /\ sourceRemoved \in BOOLEAN
  /\ alternateTargetSelected \in BOOLEAN

Init ==
  /\ phase = Dispatch
  /\ exactCompletedEvidence = FALSE
  /\ notFoundEvidence = FALSE
  /\ retryExpired = FALSE
  /\ voterReady \in BOOLEAN
  /\ quorumSafe \in BOOLEAN
  /\ membershipSafe \in BOOLEAN
  /\ leadershipSafe \in BOOLEAN
  /\ peerReachable \in BOOLEAN
  /\ interlockAvailable \in BOOLEAN
  /\ interlockHeld = FALSE
  /\ authorizationOwner = NoOwner
  /\ sourceRemoved = FALSE
  /\ alternateTargetSelected = FALSE

RecordExactCompletedResponse ==
  /\ phase = Dispatch
  /\ phase' = Continuation
  /\ exactCompletedEvidence' = TRUE
  /\ UNCHANGED << notFoundEvidence,
                  retryExpired,
                  voterReady,
                  quorumSafe,
                  membershipSafe,
                  leadershipSafe,
                  peerReachable,
                  interlockAvailable,
                  interlockHeld,
                  authorizationOwner,
                  sourceRemoved,
                  alternateTargetSelected >>

RecordNotFoundResponse ==
  /\ phase = Dispatch
  /\ phase' = Wait
  /\ notFoundEvidence' = TRUE
  /\ UNCHANGED << exactCompletedEvidence,
                  retryExpired,
                  voterReady,
                  quorumSafe,
                  membershipSafe,
                  leadershipSafe,
                  peerReachable,
                  interlockAvailable,
                  interlockHeld,
                  authorizationOwner,
                  sourceRemoved,
                  alternateTargetSelected >>

RouteExactEvidence ==
  /\ phase = Continuation
  /\ exactCompletedEvidence
  /\ phase' =
       IF ContinuationOwnsAuthorization
       THEN Removed
       ELSE IF ContinueExactEvidenceSameTurn THEN Safety ELSE Wait
  /\ authorizationOwner' =
       IF ContinuationOwnsAuthorization
       THEN ContinuationOwner
       ELSE authorizationOwner
  /\ sourceRemoved' =
       IF ContinuationOwnsAuthorization THEN TRUE ELSE sourceRemoved
  /\ UNCHANGED << exactCompletedEvidence,
                  notFoundEvidence,
                  retryExpired,
                  voterReady,
                  quorumSafe,
                  membershipSafe,
                  leadershipSafe,
                  peerReachable,
                  interlockAvailable,
                  interlockHeld,
                  alternateTargetSelected >>

ExpireRetryAndRetarget ==
  /\ phase = Wait
  /\ ~retryExpired
  /\ phase' = Retargeted
  /\ retryExpired' = TRUE
  /\ alternateTargetSelected' = TRUE
  /\ UNCHANGED << exactCompletedEvidence,
                  notFoundEvidence,
                  voterReady,
                  quorumSafe,
                  membershipSafe,
                  leadershipSafe,
                  peerReachable,
                  interlockAvailable,
                  interlockHeld,
                  authorizationOwner,
                  sourceRemoved >>

EvaluateCanonicalRemoveSafety ==
  /\ phase = Safety
  /\ exactCompletedEvidence
  /\ phase' = IF AllCanonicalGuardsReady THEN Removed ELSE Blocked
  /\ interlockHeld' =
       IF AllCanonicalGuardsReady THEN TRUE ELSE interlockHeld
  /\ authorizationOwner' =
       IF AllCanonicalGuardsReady THEN CanonicalSafetyOwner ELSE NoOwner
  /\ sourceRemoved' =
       IF AllCanonicalGuardsReady THEN TRUE ELSE FALSE
  /\ UNCHANGED << exactCompletedEvidence,
                  notFoundEvidence,
                  retryExpired,
                  voterReady,
                  quorumSafe,
                  membershipSafe,
                  leadershipSafe,
                  peerReachable,
                  interlockAvailable,
                  alternateTargetSelected >>

CanonicalGuardsConverge ==
  /\ ~AllCanonicalGuardsReady
  /\ voterReady' = TRUE
  /\ quorumSafe' = TRUE
  /\ membershipSafe' = TRUE
  /\ leadershipSafe' = TRUE
  /\ peerReachable' = TRUE
  /\ interlockAvailable' = TRUE
  /\ phase' = IF phase = Blocked THEN Safety ELSE phase
  /\ UNCHANGED << exactCompletedEvidence,
                  notFoundEvidence,
                  retryExpired,
                  interlockHeld,
                  authorizationOwner,
                  sourceRemoved,
                  alternateTargetSelected >>

SettledStutter ==
  /\ phase \in {Removed, Retargeted}
  /\ UNCHANGED vars

Next ==
  \/ RecordExactCompletedResponse
  \/ RecordNotFoundResponse
  \/ RouteExactEvidence
  \/ ExpireRetryAndRetarget
  \/ EvaluateCanonicalRemoveSafety
  \/ CanonicalGuardsConverge
  \/ SettledStutter

Fairness ==
  /\ WF_vars(RouteExactEvidence)
  /\ WF_vars(ExpireRetryAndRetarget)
  /\ WF_vars(EvaluateCanonicalRemoveSafety)
  /\ WF_vars(CanonicalGuardsConverge)

Spec == Init /\ [][Next]_vars /\ Fairness

ExactCompletedEvidenceCannotBeRetargeted ==
  ~exactCompletedEvidence \/ ~alternateTargetSelected

ContinuationCannotAuthorizeRemoval ==
  authorizationOwner # ContinuationOwner

RemovalUsesCanonicalOwnerAndInterlock ==
  ~sourceRemoved \/
    /\ authorizationOwner = CanonicalSafetyOwner
    /\ interlockHeld
    /\ voterReady
    /\ quorumSafe
    /\ membershipSafe
    /\ leadershipSafe
    /\ peerReachable

ExactSafeEvidenceEventuallyRemovesSource ==
  [](exactCompletedEvidence /\ AllCanonicalGuardsReady => <>sourceRemoved)

NotFoundCanRetarget ==
  [](notFoundEvidence => <>alternateTargetSelected)

=============================================================================
