--------------------- MODULE FormationReleaseHandoffClosure -------------------
EXTENDS Naturals, TLC

CONSTANTS FixEnabled, CohortSize, StableWindowTicks,
          PublicationCadenceTicks, BarrierBudgetTicks

VARIABLES phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          staleWriterAttempted

vars == <<phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  incarnationChanged, staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  sawReopen, ownerReloadExercised, staleWriterAttempted>>

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
                  staleWriterAttempted>>

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
                  incarnationChanged, ownerAvailable, ownerReloadExercised>>

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
  OldAuthorityWriterCompletes

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

ReleaseRetainedAcrossReopen ==
  (sawReopen /\ durableAck /\ ownerAvailable /\
   readyCount < CohortSize /\ ~incarnationChanged) => releaseAuthority

ReleaseClosesOnlyAfterReady ==
  (phase = 3) => (readyCount = CohortSize /\ ~releaseAuthority)

JoinerCohortEventuallyReadyWithinBudget ==
  <> (incarnationChanged \/
      (sawReopen /\ readyCount = CohortSize /\
       elapsedTicks <= BarrierBudgetTicks))

=============================================================================
