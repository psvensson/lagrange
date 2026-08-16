------------------- MODULE VersionedReadinessPlanning -------------------
EXTENDS Integers, FiniteSets

CONSTANTS RawEventImmediateBuild,
          OwnerReadReentersReadiness,
          TreatOlderTokenFresh,
          TrackUndeclaredDependency,
          AlwaysPromoteFormation

Owners == 1..3
FormationOwners == {1, 2}
NoOwner == 0

VARIABLES inputVersion, externalVersion, completedVersion,
          completedExternalVersion, pendingOwners, buildingOwner,
          buildingVersion, buildingExternalVersion, lastServedOwner,
          servedOwners, churnBit, formationOwner,
          prioritizedFormationOwners, heavyBuildsThisTurn, timerTicks,
          positivePublished, recursionDepth

vars == << inputVersion, externalVersion, completedVersion,
           completedExternalVersion, pendingOwners, buildingOwner,
           buildingVersion, buildingExternalVersion, lastServedOwner,
           servedOwners, churnBit, formationOwner,
           prioritizedFormationOwners, heavyBuildsThisTurn, timerTicks,
           positivePublished, recursionDepth >>

CircularDistance(owner, previous) ==
  IF owner > previous THEN owner - previous ELSE owner + Cardinality(Owners) - previous

RoundRobinOwner(pending, previous) ==
  CHOOSE owner \in pending :
    \A other \in pending :
      CircularDistance(owner, previous) <= CircularDistance(other, previous)

SelectedOwner ==
  IF formationOwner \in pendingOwners /\
       (AlwaysPromoteFormation \/
         formationOwner \notin prioritizedFormationOwners)
    THEN formationOwner
    ELSE RoundRobinOwner(pendingOwners, lastServedOwner)

Init ==
  /\ inputVersion = 0
  /\ externalVersion = 0
  /\ completedVersion = -1
  /\ completedExternalVersion = -1
  /\ pendingOwners = Owners
  /\ buildingOwner = NoOwner
  /\ buildingVersion = -1
  /\ buildingExternalVersion = -1
  /\ lastServedOwner = Cardinality(Owners)
  /\ servedOwners = {}
  /\ churnBit = 0
  /\ formationOwner = 1
  /\ prioritizedFormationOwners = {}
  /\ heavyBuildsThisTurn = 0
  /\ timerTicks = 0
  /\ positivePublished = FALSE
  /\ recursionDepth = 0

InputChange ==
  /\ inputVersion < 2
  /\ inputVersion' = inputVersion + 1
  /\ positivePublished' = FALSE
  /\ IF RawEventImmediateBuild
        THEN /\ completedVersion' = inputVersion + 1
             /\ completedExternalVersion' = externalVersion
             /\ heavyBuildsThisTurn' = heavyBuildsThisTurn + 1
             /\ pendingOwners' = {}
        ELSE /\ UNCHANGED << completedVersion, completedExternalVersion,
                              heavyBuildsThisTurn >>
             /\ pendingOwners' = Owners
  /\ UNCHANGED << externalVersion, buildingOwner, buildingVersion,
                  buildingExternalVersion, lastServedOwner, servedOwners,
                  churnBit, formationOwner, prioritizedFormationOwners,
                  timerTicks, recursionDepth >>

UndeclaredDependencyChange ==
  /\ externalVersion = 0
  /\ externalVersion' = 1
  /\ positivePublished' = FALSE
  /\ pendingOwners' = IF TrackUndeclaredDependency THEN Owners ELSE pendingOwners
  /\ UNCHANGED << inputVersion, completedVersion,
                  completedExternalVersion, buildingOwner, buildingVersion,
                  buildingExternalVersion, lastServedOwner, servedOwners,
                  churnBit, formationOwner, prioritizedFormationOwners,
                  heavyBuildsThisTurn, timerTicks, recursionDepth >>

OwnerDirtyChurn ==
  /\ churnBit' = 1 - churnBit
  /\ formationOwner' = IF formationOwner = 1 THEN 2 ELSE 1
  /\ pendingOwners' = Owners
  /\ positivePublished' = FALSE
  /\ UNCHANGED << inputVersion, externalVersion, completedVersion,
                  completedExternalVersion, buildingOwner, buildingVersion,
                  buildingExternalVersion, lastServedOwner, servedOwners,
                  prioritizedFormationOwners,
                  heavyBuildsThisTurn, timerTicks, recursionDepth >>

ScheduleBuild ==
  /\ pendingOwners # {}
  /\ buildingOwner = NoOwner
  /\ heavyBuildsThisTurn = 0
  /\ buildingOwner' = SelectedOwner
  /\ buildingVersion' = inputVersion
  /\ buildingExternalVersion' = externalVersion
  /\ pendingOwners' = pendingOwners \ {SelectedOwner}
  /\ prioritizedFormationOwners' =
       IF SelectedOwner = formationOwner
         THEN prioritizedFormationOwners \cup {formationOwner}
         ELSE prioritizedFormationOwners
  /\ heavyBuildsThisTurn' = 1
  /\ UNCHANGED << inputVersion, externalVersion, completedVersion,
                  completedExternalVersion, lastServedOwner, servedOwners,
                  churnBit, formationOwner, timerTicks, positivePublished,
                  recursionDepth >>

CompleteBuild ==
  /\ buildingOwner # NoOwner
  /\ completedVersion' = buildingVersion
  /\ completedExternalVersion' = buildingExternalVersion
  /\ pendingOwners' = pendingOwners \cup
       (IF buildingVersion # inputVersion \/
           (TrackUndeclaredDependency /\
             buildingExternalVersion # externalVersion)
          THEN Owners ELSE {})
  /\ lastServedOwner' = buildingOwner
  /\ servedOwners' = servedOwners \cup {buildingOwner}
  /\ buildingOwner' = NoOwner
  /\ buildingVersion' = -1
  /\ buildingExternalVersion' = -1
  /\ UNCHANGED << inputVersion, externalVersion, heavyBuildsThisTurn,
                  churnBit, formationOwner, prioritizedFormationOwners,
                  timerTicks, positivePublished, recursionDepth >>

MacrotaskTick ==
  /\ timerTicks' = 1 - timerTicks
  /\ heavyBuildsThisTurn' = 0
  /\ UNCHANGED << inputVersion, externalVersion, completedVersion,
                  completedExternalVersion, pendingOwners, buildingOwner,
                  buildingVersion, buildingExternalVersion, lastServedOwner,
                  servedOwners, churnBit, formationOwner,
                  prioritizedFormationOwners, positivePublished,
                  recursionDepth >>

RouteRead ==
  /\ completedVersion >= 0
  /\ recursionDepth' = IF OwnerReadReentersReadiness THEN 1 ELSE 0
  /\ positivePublished' =
       IF TreatOlderTokenFresh
         THEN TRUE
         ELSE completedVersion = inputVersion /\
              (IF TrackUndeclaredDependency
                 THEN completedExternalVersion = externalVersion
                 ELSE TRUE)
  /\ UNCHANGED << inputVersion, externalVersion, completedVersion,
                  completedExternalVersion, pendingOwners, buildingOwner,
                  buildingVersion, buildingExternalVersion, lastServedOwner,
                  servedOwners, churnBit, formationOwner,
                  prioritizedFormationOwners, heavyBuildsThisTurn,
                  timerTicks >>

PublishDecision == RouteRead

Stutter == UNCHANGED vars

Next == InputChange \/ UndeclaredDependencyChange \/ OwnerDirtyChurn \/
        ScheduleBuild \/ CompleteBuild \/ MacrotaskTick \/ RouteRead \/
        PublishDecision \/ Stutter

Spec == Init /\ [][Next]_vars /\ WF_vars(ScheduleBuild) /\
        WF_vars(CompleteBuild) /\ WF_vars(MacrotaskTick)

TypeOK ==
  /\ inputVersion \in 0..2
  /\ externalVersion \in 0..1
  /\ completedVersion \in -1..2
  /\ completedExternalVersion \in -1..1
  /\ pendingOwners \subseteq Owners
  /\ buildingOwner \in Owners \cup {NoOwner}
  /\ buildingVersion \in -1..2
  /\ buildingExternalVersion \in -1..1
  /\ lastServedOwner \in Owners
  /\ servedOwners \subseteq Owners
  /\ churnBit \in 0..1
  /\ formationOwner \in FormationOwners
  /\ prioritizedFormationOwners \subseteq FormationOwners
  /\ heavyBuildsThisTurn >= 0
  /\ timerTicks \in 0..1
  /\ recursionDepth \in 0..1

NoStalePositive ==
  positivePublished =>
    completedVersion = inputVersion /\
    completedExternalVersion = externalVersion

HeavyWorkTurnBounded == heavyBuildsThisTurn <= 1
OwnerReadNonAmplifying == recursionDepth = 0
EventuallyFresh == <>(completedVersion = inputVersion /\
                       completedExternalVersion = externalVersion)
EventuallyAllOwnersServed == <>(servedOwners = Owners)

=============================================================================
