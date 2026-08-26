--------------------- MODULE FormationReleaseHandoffClosure -------------------
EXTENDS Naturals, TLC

CONSTANTS FixEnabled, ExactMembershipEquality, CohortSize, StableWindowTicks,
          PublicationCadenceTicks, BarrierBudgetTicks

VARIABLES phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          staleWriterAttempted, membershipExpanded,
          uncapturedConsumerAttempted, uncapturedReleaseAuthorized,
          completedGenerationCount

vars == <<phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          staleWriterAttempted, membershipExpanded,
          uncapturedConsumerAttempted, uncapturedReleaseAuthorized,
          completedGenerationCount>>

Init ==
  /\ phase = 0
  /\ openGap = TRUE
  /\ releaseAuthority = FALSE
  /\ identityCount = 0
  /\ capturedIdentityCount = 0
  /\ durableIdentityCount = 0
  /\ authorityBoot = 1
  /\ capturedAuthorityBoot = 0
  /\ durableAuthorityBoot = 0
  /\ generationPublished = FALSE
  /\ durableAck = FALSE
  /\ consumerCount = 0
  /\ stableTicks = 0
  /\ readyCount = 0
  /\ elapsedTicks = 0
  /\ sawSatisfied = FALSE
  /\ sawReopen = FALSE
  /\ incarnationChanged = FALSE
  /\ ownerAvailable = TRUE
  /\ ownerReloadExercised = FALSE
  /\ staleWriterAttempted = FALSE
  /\ membershipExpanded = FALSE
  /\ uncapturedConsumerAttempted = FALSE
  /\ uncapturedReleaseAuthorized = FALSE
  /\ completedGenerationCount = 0

ObserveOneCurrentPrimaryIdentity ==
  /\ phase = 0
  /\ identityCount < CohortSize
  /\ identityCount' = identityCount + 1
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<phase, openGap, releaseAuthority,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount, stableTicks,
                  readyCount, sawSatisfied, sawReopen, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

FirstSpreadSatisfied ==
  /\ phase = 0
  /\ openGap
  /\ identityCount = CohortSize
  /\ phase' = 1
  /\ openGap' = FALSE
  /\ capturedIdentityCount' = IF FixEnabled THEN identityCount ELSE 0
  /\ capturedAuthorityBoot' = IF FixEnabled THEN authorityBoot ELSE 0
  /\ releaseAuthority' = IF FixEnabled THEN FALSE ELSE TRUE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ sawSatisfied' = TRUE
  /\ UNCHANGED <<identityCount, durableIdentityCount, authorityBoot,
                  durableAuthorityBoot, generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

PublishSeedGeneration ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ ~generationPublished
  /\ capturedIdentityCount = CohortSize
  /\ capturedAuthorityBoot = authorityBoot
  /\ generationPublished' = TRUE
  /\ durableAuthorityBoot' = capturedAuthorityBoot
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

AcknowledgeDurableReadback ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ generationPublished
  /\ ~durableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ durableAck' = TRUE
  /\ releaseAuthority' = TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot, capturedAuthorityBoot,
                  durableAuthorityBoot, generationPublished, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

SpreadGapReopens ==
  /\ phase = 1
  /\ ~openGap
  /\ readyCount < CohortSize
  /\ phase' = 2
  /\ openGap' = TRUE
  /\ releaseAuthority' = IF FixEnabled THEN releaseAuthority ELSE FALSE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ sawReopen' = TRUE
  /\ UNCHANGED <<identityCount, capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

ConfirmOneDurableNodeIncarnation ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ durableIdentityCount < capturedIdentityCount
  /\ durableIdentityCount' = durableIdentityCount + 1
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

ConsumeSeedGenerationOnOneJoiner ==
  /\ phase = 2
  /\ ownerAvailable
  /\ releaseAuthority
  /\ generationPublished
  /\ durableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ consumerCount < CohortSize
  /\ consumerCount' = consumerCount + 1
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, stableTicks, readyCount,
                  sawSatisfied, sawReopen, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

StableWindowEvent ==
  /\ phase = 2
  /\ ownerAvailable
  /\ releaseAuthority
  /\ durableIdentityCount = CohortSize
  /\ consumerCount = CohortSize
  /\ stableTicks < StableWindowTicks
  /\ stableTicks' = stableTicks + 1
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount, readyCount,
                  sawSatisfied, sawReopen, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

PublishOneReadyLease ==
  /\ phase = 2
  /\ ownerAvailable
  /\ releaseAuthority
  /\ stableTicks = StableWindowTicks
  /\ readyCount < CohortSize
  /\ readyCount' = readyCount + 1
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ phase' = IF readyCount' = CohortSize THEN 3 ELSE phase
  /\ releaseAuthority' = IF readyCount' = CohortSize THEN FALSE ELSE TRUE
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, sawSatisfied, sawReopen, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

CrashInteractionOwner ==
  /\ FixEnabled
  /\ phase = 2
  /\ ownerAvailable
  /\ durableAck
  /\ ~ownerReloadExercised
  /\ ownerAvailable' = FALSE
  /\ ownerReloadExercised' = TRUE
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, staleWriterAttempted,
                  membershipExpanded, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount>>

RehydrateSameBootGeneration ==
  /\ FixEnabled
  /\ phase = 2
  /\ ~ownerAvailable
  /\ generationPublished
  /\ durableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ ownerAvailable' = TRUE
  /\ releaseAuthority' = TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

RestartAuthorityBoot ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ~incarnationChanged
  /\ authorityBoot' = 2
  /\ phase' = 4
  /\ releaseAuthority' = FALSE
  /\ ownerAvailable' = FALSE
  /\ incarnationChanged' = TRUE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, capturedAuthorityBoot,
                  durableAuthorityBoot, generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawSatisfied,
                  sawReopen, ownerReloadExercised, staleWriterAttempted,
                  membershipExpanded, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount>>

CapturedPeerIncarnationChanges ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ~incarnationChanged
  /\ phase' = 4
  /\ releaseAuthority' = FALSE
  /\ incarnationChanged' = TRUE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

OldAuthorityWriterCompletes ==
  /\ FixEnabled
  /\ phase = 4
  /\ incarnationChanged
  /\ ~staleWriterAttempted
  /\ staleWriterAttempted' = TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  membershipExpanded, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount>>

CanonicalMembershipExpands ==
  /\ FixEnabled
  /\ phase = 2
  /\ ~membershipExpanded
  /\ membershipExpanded' = TRUE
  /\ phase' = IF ExactMembershipEquality THEN 4 ELSE phase
  /\ releaseAuthority' =
       IF ExactMembershipEquality THEN FALSE ELSE releaseAuthority
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount>>

AttemptUncapturedConsumer ==
  /\ FixEnabled
  /\ phase = 2
  /\ membershipExpanded
  /\ ~uncapturedConsumerAttempted
  /\ uncapturedConsumerAttempted' = TRUE
  /\ uncapturedReleaseAuthorized' = FALSE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot,
                  durableAuthorityBoot, generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawSatisfied,
                  sawReopen, incarnationChanged, ownerAvailable,
                  ownerReloadExercised, staleWriterAttempted,
                  membershipExpanded, completedGenerationCount>>

CapturedCanonicalMemberRemoved ==
  /\ FixEnabled
  /\ phase = 2
  /\ membershipExpanded
  /\ ~incarnationChanged
  /\ phase' = 4
  /\ releaseAuthority' = FALSE
  /\ incarnationChanged' = TRUE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount>>

BeginSequentialGeneration ==
  /\ FixEnabled
  /\ phase = 3
  /\ completedGenerationCount = 0
  /\ phase' = 0
  /\ openGap' = TRUE
  /\ releaseAuthority' = FALSE
  /\ identityCount' = 0
  /\ capturedIdentityCount' = 0
  /\ durableIdentityCount' = 0
  /\ capturedAuthorityBoot' = 0
  /\ durableAuthorityBoot' = 0
  /\ generationPublished' = FALSE
  /\ durableAck' = FALSE
  /\ consumerCount' = 0
  /\ stableTicks' = 0
  /\ readyCount' = 0
  /\ elapsedTicks' = 0
  /\ sawSatisfied' = FALSE
  /\ sawReopen' = FALSE
  /\ ownerAvailable' = TRUE
  /\ membershipExpanded' = FALSE
  /\ uncapturedConsumerAttempted' = FALSE
  /\ uncapturedReleaseAuthorized' = FALSE
  /\ completedGenerationCount' = 1
  /\ UNCHANGED <<authorityBoot, incarnationChanged,
                  ownerReloadExercised, staleWriterAttempted>>

Next ==
  ObserveOneCurrentPrimaryIdentity \/
  FirstSpreadSatisfied \/
  PublishSeedGeneration \/
  AcknowledgeDurableReadback \/
  SpreadGapReopens \/
  ConfirmOneDurableNodeIncarnation \/
  ConsumeSeedGenerationOnOneJoiner \/
  StableWindowEvent \/
  PublishOneReadyLease \/
  CrashInteractionOwner \/
  RehydrateSameBootGeneration \/
  RestartAuthorityBoot \/
  CapturedPeerIncarnationChanges \/
  OldAuthorityWriterCompletes \/
  CanonicalMembershipExpands \/
  AttemptUncapturedConsumer \/
  CapturedCanonicalMemberRemoved \/
  BeginSequentialGeneration

Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ WF_vars(ObserveOneCurrentPrimaryIdentity)
  /\ WF_vars(FirstSpreadSatisfied)
  /\ WF_vars(PublishSeedGeneration)
  /\ WF_vars(AcknowledgeDurableReadback)
  /\ WF_vars(SpreadGapReopens)
  /\ WF_vars(ConfirmOneDurableNodeIncarnation)
  /\ WF_vars(ConsumeSeedGenerationOnOneJoiner)
  /\ WF_vars(StableWindowEvent)
  /\ WF_vars(PublishOneReadyLease)
  /\ WF_vars(RehydrateSameBootGeneration)
  /\ WF_vars(CanonicalMembershipExpands)
  /\ WF_vars(AttemptUncapturedConsumer)
  /\ WF_vars(BeginSequentialGeneration)

TypeInvariant ==
  /\ phase \in 0..4
  /\ openGap \in BOOLEAN
  /\ releaseAuthority \in BOOLEAN
  /\ identityCount \in 0..CohortSize
  /\ capturedIdentityCount \in 0..CohortSize
  /\ durableIdentityCount \in 0..CohortSize
  /\ authorityBoot \in {1, 2}
  /\ capturedAuthorityBoot \in 0..2
  /\ durableAuthorityBoot \in 0..2
  /\ generationPublished \in BOOLEAN
  /\ durableAck \in BOOLEAN
  /\ consumerCount \in 0..CohortSize
  /\ stableTicks \in 0..StableWindowTicks
  /\ readyCount \in 0..CohortSize
  /\ elapsedTicks \in Nat
  /\ sawSatisfied \in BOOLEAN
  /\ sawReopen \in BOOLEAN
  /\ incarnationChanged \in BOOLEAN
  /\ ownerAvailable \in BOOLEAN
  /\ ownerReloadExercised \in BOOLEAN
  /\ staleWriterAttempted \in BOOLEAN
  /\ membershipExpanded \in BOOLEAN
  /\ uncapturedConsumerAttempted \in BOOLEAN
  /\ uncapturedReleaseAuthorized \in BOOLEAN
  /\ completedGenerationCount \in 0..1

ReleaseRequiresDurableAck ==
  releaseAuthority =>
    generationPublished /\ durableAck /\ ownerAvailable /\
    capturedIdentityCount = CohortSize /\
    capturedAuthorityBoot = authorityBoot /\
    durableAuthorityBoot = authorityBoot

PublishedGenerationIsIdentityBound ==
  generationPublished =>
    capturedIdentityCount = CohortSize /\
    capturedAuthorityBoot > 0 /\
    durableAuthorityBoot = capturedAuthorityBoot

ConsumerRequiresExactDurableGeneration ==
  consumerCount > 0 =>
    generationPublished /\ durableAck /\
    durableAuthorityBoot = capturedAuthorityBoot

NoReleaseAfterIncarnationChange ==
  incarnationChanged => ~releaseAuthority

StaleAuthorityWriteCannotAuthorizeCurrentBoot ==
  (staleWriterAttempted /\ authorityBoot # capturedAuthorityBoot) =>
    ~releaseAuthority /\ durableAuthorityBoot # authorityBoot

ReloadRestoresOnlySameBootGeneration ==
  (ownerReloadExercised /\ ownerAvailable /\ releaseAuthority) =>
    durableAuthorityBoot = authorityBoot

CanonicalExpansionCannotAuthorizeAddedMember ==
  membershipExpanded => ~uncapturedReleaseAuthorized

ReleaseRetainedAcrossReopen ==
  (sawReopen /\ durableAck /\ ownerAvailable /\
   readyCount < CohortSize /\ ~incarnationChanged) => releaseAuthority

ReleaseClosesOnlyAfterReady ==
  (phase = 3) => (readyCount = CohortSize /\ ~releaseAuthority)

JoinerCohortEventuallyReadyWithinBudget ==
  <> (incarnationChanged \/
      (sawReopen /\ readyCount = CohortSize /\
       elapsedTicks <= BarrierBudgetTicks))

SequentialGenerationsEventuallyCloseWithinBudget ==
  <> (incarnationChanged \/
      (completedGenerationCount = 1 /\ phase = 3 /\
       readyCount = CohortSize /\ elapsedTicks <= BarrierBudgetTicks))

=============================================================================
