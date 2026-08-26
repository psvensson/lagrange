--------------------- MODULE FormationReleaseHandoffClosure -------------------
EXTENDS Naturals, TLC

CONSTANTS FixEnabled, ExactMembershipEquality, ProjectionOmissionRevokes,
          ProjectionSynchronizationRevokes,
          SeedProjectionTransportEnabled,
          BilateralIdentifyEnabled, TerminalReplayFenceEnabled,
          MinimumCohortSize,
          DistributedPublicationReadAvailable, CohortSize, StableWindowTicks,
          PublicationCadenceTicks, BarrierBudgetTicks

VARIABLES phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          terminalReloadExercised,
          durableReopenAck, terminalIntent, terminalPublished,
          terminalDurableAck, pendingTerminalReloadExercised,
          preDurableTerminalRestartExercised,
          durablePendingTerminalRestartExercised,
          staleWriterAttempted, membershipExpanded,
          projectionOmissionExercised, projectionSynchronizationExercised,
          seedBaseProjectionObserved,
          uncapturedConsumerAttempted, uncapturedReleaseAuthorized,
          completedGenerationCount

vars == <<phase, openGap, releaseAuthority, identityCount,
          capturedIdentityCount, durableIdentityCount,
          authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
          generationPublished, durableAck, consumerCount,
          stableTicks, readyCount, elapsedTicks, sawSatisfied, sawReopen,
          incarnationChanged, ownerAvailable, ownerReloadExercised,
          terminalReloadExercised,
          durableReopenAck, terminalIntent, terminalPublished,
          terminalDurableAck, pendingTerminalReloadExercised,
          preDurableTerminalRestartExercised,
          durablePendingTerminalRestartExercised,
          staleWriterAttempted, membershipExpanded,
          projectionOmissionExercised, projectionSynchronizationExercised,
          seedBaseProjectionObserved,
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
  /\ terminalReloadExercised = FALSE
  /\ durableReopenAck = FALSE
  /\ terminalIntent = 0
  /\ terminalPublished = FALSE
  /\ terminalDurableAck = FALSE
  /\ pendingTerminalReloadExercised = FALSE
  /\ preDurableTerminalRestartExercised = FALSE
  /\ durablePendingTerminalRestartExercised = FALSE
  /\ staleWriterAttempted = FALSE
  /\ membershipExpanded = FALSE
  /\ projectionOmissionExercised = FALSE
  /\ projectionSynchronizationExercised = FALSE
  /\ seedBaseProjectionObserved = FALSE
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

ObserveSeedBaseProjectionForDiscovery ==
  \* The strict seed projection can reveal placement scope before a durable
  \* handoff exists, but this observation is never release authority.
  /\ phase = 0
  /\ SeedProjectionTransportEnabled
  /\ identityCount = CohortSize
  /\ ~seedBaseProjectionObserved
  /\ seedBaseProjectionObserved' = TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount>>

FirstSpreadSatisfied ==
  /\ phase = 0
  /\ openGap
  /\ CohortSize >= MinimumCohortSize
  /\ identityCount = CohortSize
  /\ seedBaseProjectionObserved
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

AcknowledgeDurableReadback ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ generationPublished
  /\ ~durableAck
  /\ terminalIntent = 0
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

SpreadGapReopens ==
  /\ phase = 1
  /\ ~openGap
  \* The canonical false summary may be observed before an adjacent stream
  \* reason projection.  The fixed snapshot owner treats both as one atomic
  \* RECOVERY_PENDING observation and retains the generation.
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CompatibleProjectionSynchronization ==
  \* Publication projection and membership shadow can briefly disagree while
  \* the captured physical rows, current-primary boots, authority boot, and
  \* fence remain exact.  The concrete startup owner classifies both the sole
  \* publication_epoch_pending shape with spread satisfied and the canonical
  \* [publication_epoch_pending, priority_partitions_not_spread] compound
  \* shape as synchronization.  The compound observation does not set
  \* sawReopen; only a later sole spread reason owns that edge.  This is
  \* neither a spread reopen nor member-loss authority.  The mutant reproduces
  \* the premature runtime revocation.
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ durableAck
  /\ releaseAuthority
  /\ ~sawReopen
  /\ readyCount < CohortSize
  /\ ~projectionSynchronizationExercised
  /\ projectionSynchronizationExercised' = TRUE
  /\ phase' = IF ProjectionSynchronizationRevokes THEN 2 ELSE phase
  /\ terminalIntent' =
       IF ProjectionSynchronizationRevokes THEN 4 ELSE terminalIntent
  /\ releaseAuthority' =
       IF ProjectionSynchronizationRevokes THEN FALSE ELSE releaseAuthority
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount, projectionOmissionExercised,
                  seedBaseProjectionObserved,
                  terminalReloadExercised, durableReopenAck,
                  terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

AcknowledgeReopenedActive ==
  /\ FixEnabled
  /\ phase = 2
  /\ ownerAvailable
  /\ generationPublished
  /\ durableAck
  /\ sawReopen
  /\ releaseAuthority
  /\ ~durableReopenAck
  /\ durableReopenAck' = TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot,
                  durableAuthorityBoot, generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawSatisfied,
                  sawReopen, incarnationChanged, ownerAvailable,
                  ownerReloadExercised, terminalReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  terminalIntent, terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

ConsumeSeedGenerationOnOneJoiner ==
  \* PublicationCadenceTicks charges the bounded seed GET deadline plus the
  \* existing formation-poll delay; the runtime binds each leg to pollMs.
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ SeedProjectionTransportEnabled
  /\ BilateralIdentifyEnabled
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

LiveActiveReleaseSubstate ==
  phase = 2 /\
  ownerAvailable /\
  terminalIntent = 0 /\
  ~incarnationChanged

CapturedProjectionTemporarilyOmitsMember ==
  /\ FixEnabled
  /\ LiveActiveReleaseSubstate
  /\ durableAck
  /\ releaseAuthority
  /\ readyCount < CohortSize
  /\ ~projectionOmissionExercised
  /\ projectionOmissionExercised' = TRUE
  /\ phase' = phase
  /\ terminalIntent' =
       IF ProjectionOmissionRevokes THEN 4 ELSE terminalIntent
  /\ releaseAuthority' =
       IF ProjectionOmissionRevokes THEN FALSE ELSE releaseAuthority
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  terminalReloadExercised, durableReopenAck,
                  terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

StableWindowEvent ==
  /\ phase \in {1, 2}
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

PublishOneReadyLease ==
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ releaseAuthority
  /\ stableTicks = StableWindowTicks
  /\ readyCount < CohortSize
  /\ readyCount' = readyCount + 1
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ phase' = phase
  /\ releaseAuthority' = TRUE
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, sawSatisfied, sawReopen, incarnationChanged,
                  ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CompleteReopenedReadyCohort ==
  \* If the final READY lease existed before the first reopened observation,
  \* retain one ACTIVE state at phase 2 and close on this next owner event.
  /\ phase = 2
  /\ sawReopen
  /\ durableReopenAck
  /\ readyCount = CohortSize
  /\ releaseAuthority
  /\ terminalIntent = 0
  /\ phase' = phase
  /\ terminalIntent' = 3
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized,
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, terminalReloadExercised,
                  durableReopenAck, terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

PublishTerminalIntent ==
  /\ FixEnabled
  /\ phase = 2
  /\ ownerAvailable
  /\ terminalIntent \in {3, 4}
  /\ ~terminalPublished
  /\ terminalPublished' = TRUE
  /\ durableAuthorityBoot' = capturedAuthorityBoot
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, releaseAuthority, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot,
                  generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawSatisfied,
                  sawReopen, incarnationChanged, ownerAvailable,
                  ownerReloadExercised, terminalReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  durableReopenAck, terminalIntent, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

AcknowledgeTerminalReadback ==
  /\ FixEnabled
  /\ phase = 2
  /\ ownerAvailable
  /\ terminalIntent \in {3, 4}
  /\ terminalPublished
  /\ durableAuthorityBoot = authorityBoot
  /\ ~terminalDurableAck
  /\ terminalDurableAck' = TRUE
  /\ phase' = terminalIntent
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable,
                  ownerReloadExercised, terminalReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  durableReopenAck, terminalIntent, terminalPublished,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

CrashPendingTerminalOwner ==
  /\ FixEnabled
  /\ phase = 2
  /\ ownerAvailable
  /\ terminalIntent \in {3, 4}
  /\ ~terminalDurableAck
  /\ generationPublished \/ terminalPublished
  /\ durableAuthorityBoot = authorityBoot
  /\ ~pendingTerminalReloadExercised
  /\ ownerAvailable' = FALSE
  /\ pendingTerminalReloadExercised' = TRUE
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  terminalReloadExercised, staleWriterAttempted,
                  membershipExpanded, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  durableReopenAck, terminalIntent, terminalPublished,
                  terminalDurableAck,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RehydratePendingTerminalFromDurableActive ==
  /\ FixEnabled
  /\ phase = 2
  /\ ~ownerAvailable
  /\ pendingTerminalReloadExercised
  /\ generationPublished
  /\ ~terminalPublished
  /\ durableAuthorityBoot = authorityBoot
  /\ terminalIntent \in {3, 4}
  /\ ownerAvailable' = TRUE
  /\ durableAck' = TRUE
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  terminalReloadExercised, staleWriterAttempted,
                  membershipExpanded, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  durableReopenAck, terminalIntent, terminalPublished,
                  terminalDurableAck, pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RehydratePendingTerminalFromDurableTerminal ==
  /\ FixEnabled
  /\ phase = 2
  /\ ~ownerAvailable
  /\ pendingTerminalReloadExercised
  /\ terminalIntent \in {3, 4}
  /\ terminalPublished
  /\ ~terminalDurableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ ownerAvailable' = TRUE
  /\ terminalDurableAck' = TRUE
  /\ phase' = terminalIntent
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  terminalReloadExercised, staleWriterAttempted,
                  membershipExpanded, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  durableReopenAck, terminalIntent, terminalPublished,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

CrashInteractionOwner ==
  \* Temporary interaction-owner downtime withdraws process-local release.
  \* Same-boot recovery is owned by RehydrateSameBootGeneration and the
  \* OwnerDowntimeEventuallyResolves property below.
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ownerAvailable
  /\ durableAck
  /\ terminalIntent = 0
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
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  durableReopenAck, terminalIntent, terminalPublished,
                  terminalDurableAck, pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RehydrateSameBootGeneration ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ~ownerAvailable
  /\ generationPublished
  /\ durableAck
  /\ terminalIntent = 0
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CrashTerminalOwner ==
  \* COMPLETE/REVOKED are durable replay fences, not process-local memory.
  /\ FixEnabled
  /\ phase \in {3, 4}
  /\ ownerAvailable
  /\ terminalPublished
  /\ terminalDurableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ ~terminalReloadExercised
  /\ ownerAvailable' = FALSE
  /\ terminalReloadExercised' = TRUE
  /\ releaseAuthority' = FALSE
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<phase, openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  staleWriterAttempted,
                  membershipExpanded, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  durableReopenAck, terminalIntent, terminalPublished,
                  terminalDurableAck, pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RehydrateTerminalFence ==
  /\ FixEnabled
  /\ phase \in {3, 4}
  /\ ~ownerAvailable
  /\ terminalReloadExercised
  /\ terminalPublished
  /\ terminalDurableAck
  /\ durableAuthorityBoot = authorityBoot
  /\ ownerAvailable' = TRUE
  /\ phase' = IF TerminalReplayFenceEnabled THEN phase ELSE 2
  /\ releaseAuthority' =
       IF TerminalReplayFenceEnabled THEN FALSE ELSE TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, authorityBoot,
                  capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerReloadExercised,
                  terminalReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  durableReopenAck, terminalIntent, terminalPublished,
                  terminalDurableAck, pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RestartAuthorityBoot ==
  /\ FixEnabled
  /\ phase \in {1, 2}
  /\ ~incarnationChanged
  /\ terminalIntent = 0
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
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CapturedPeerIncarnationChanges ==
  /\ FixEnabled
  /\ phase = 2
  /\ ~incarnationChanged
  /\ terminalIntent = 0
  /\ phase' = phase
  /\ terminalIntent' = 4
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
                  completedGenerationCount, projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved, terminalReloadExercised,
                  durableReopenAck, terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

RestartAuthorityBootDuringPendingTerminal(durableIdentityExists) ==
  \* A new authority boot is disjoint from the old generation.  It cannot
  \* inherit a process-local terminal intent, and it cannot authorize the
  \* old durable ACTIVE contract because the boot fence no longer matches.
  /\ FixEnabled
  /\ phase = 2
  /\ authorityBoot = 1
  /\ terminalIntent \in {3, 4}
  /\ durableIdentityExists = (generationPublished \/ terminalPublished)
  /\ authorityBoot' = 2
  /\ phase' = 4
  /\ releaseAuthority' = FALSE
  /\ ownerAvailable' = FALSE
  /\ incarnationChanged' = TRUE
  /\ durableReopenAck' = FALSE
  /\ terminalIntent' = 0
  /\ terminalPublished' =
       IF durableIdentityExists THEN terminalPublished ELSE FALSE
  /\ terminalDurableAck' = FALSE
  /\ pendingTerminalReloadExercised' = FALSE
  /\ preDurableTerminalRestartExercised' = ~durableIdentityExists
  /\ durablePendingTerminalRestartExercised' = durableIdentityExists
  /\ elapsedTicks' = elapsedTicks + 1
  /\ UNCHANGED <<openGap, identityCount, capturedIdentityCount,
                  durableIdentityCount, capturedAuthorityBoot,
                  durableAuthorityBoot, generationPublished, durableAck,
                  consumerCount, stableTicks, readyCount, sawSatisfied,
                  sawReopen, ownerReloadExercised, terminalReloadExercised,
                  staleWriterAttempted, membershipExpanded,
                  uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

LosePreDurableTerminalIntentOnAuthorityRestart ==
  RestartAuthorityBootDuringPendingTerminal(FALSE)

InvalidateDurablePendingTerminalOnAuthorityRestart ==
  RestartAuthorityBootDuringPendingTerminal(TRUE)

StaleDurableActiveReplayCompletes ==
  /\ FixEnabled
  /\ phase \in {3, 4}
  /\ ownerAvailable
  /\ terminalDurableAck
  /\ ~staleWriterAttempted
  /\ staleWriterAttempted' = TRUE
  /\ phase' = IF TerminalReplayFenceEnabled THEN phase ELSE 2
  /\ releaseAuthority' =
       IF TerminalReplayFenceEnabled THEN releaseAuthority ELSE TRUE
  /\ elapsedTicks' = elapsedTicks + PublicationCadenceTicks
  /\ UNCHANGED <<openGap, identityCount,
                  capturedIdentityCount, durableIdentityCount,
                  authorityBoot, capturedAuthorityBoot, durableAuthorityBoot,
                  generationPublished, durableAck, consumerCount,
                  stableTicks, readyCount, sawSatisfied, sawReopen,
                  incarnationChanged, ownerAvailable, ownerReloadExercised,
                  membershipExpanded, uncapturedConsumerAttempted,
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CanonicalMembershipExpands ==
  /\ FixEnabled
  /\ LiveActiveReleaseSubstate
  /\ releaseAuthority
  /\ readyCount < CohortSize
  /\ ~membershipExpanded
  /\ membershipExpanded' = TRUE
  /\ phase' = phase
  /\ terminalIntent' =
       IF ExactMembershipEquality THEN 4 ELSE terminalIntent
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
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  terminalReloadExercised, durableReopenAck,
                  terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

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
                  membershipExpanded, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved>>

CapturedCanonicalMemberRemoved ==
  /\ FixEnabled
  /\ phase = 2
  /\ membershipExpanded
  /\ ~incarnationChanged
  /\ terminalIntent = 0
  /\ phase' = phase
  /\ terminalIntent' = 4
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
                  uncapturedReleaseAuthorized, completedGenerationCount,
                  projectionOmissionExercised,
                  projectionSynchronizationExercised,
                  seedBaseProjectionObserved,
                  terminalReloadExercised, durableReopenAck,
                  terminalPublished, terminalDurableAck,
                  pendingTerminalReloadExercised,
                  preDurableTerminalRestartExercised,
                  durablePendingTerminalRestartExercised>>

BeginSequentialGeneration ==
  /\ FixEnabled
  /\ phase = 3
  /\ completedGenerationCount = 0
  /\ staleWriterAttempted
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
  /\ projectionOmissionExercised' = FALSE
  /\ projectionSynchronizationExercised' = FALSE
  /\ seedBaseProjectionObserved' = FALSE
  /\ staleWriterAttempted' = FALSE
  /\ completedGenerationCount' = 1
  /\ terminalReloadExercised' = FALSE
  /\ durableReopenAck' = FALSE
  /\ terminalIntent' = 0
  /\ terminalPublished' = FALSE
  /\ terminalDurableAck' = FALSE
  /\ pendingTerminalReloadExercised' = FALSE
  /\ preDurableTerminalRestartExercised' = FALSE
  /\ durablePendingTerminalRestartExercised' = FALSE
  /\ UNCHANGED <<authorityBoot, incarnationChanged,
                  ownerReloadExercised>>

OrdinaryNext ==
  ObserveOneCurrentPrimaryIdentity \/
  ObserveSeedBaseProjectionForDiscovery \/
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
  StaleDurableActiveReplayCompletes \/
  AttemptUncapturedConsumer

PreserveTerminalProtocol(Action) ==
  Action /\ UNCHANGED <<terminalReloadExercised, durableReopenAck,
                        terminalIntent, terminalPublished,
                        terminalDurableAck,
                        pendingTerminalReloadExercised,
                        preDurableTerminalRestartExercised,
                        durablePendingTerminalRestartExercised>>

Next ==
  PreserveTerminalProtocol(OrdinaryNext) \/
  CompatibleProjectionSynchronization \/
  AcknowledgeReopenedActive \/
  CompleteReopenedReadyCohort \/
  PublishTerminalIntent \/
  AcknowledgeTerminalReadback \/
  CrashPendingTerminalOwner \/
  RehydratePendingTerminalFromDurableActive \/
  RehydratePendingTerminalFromDurableTerminal \/
  CapturedCanonicalMemberRemoved \/
  CapturedPeerIncarnationChanges \/
  LosePreDurableTerminalIntentOnAuthorityRestart \/
  InvalidateDurablePendingTerminalOnAuthorityRestart \/
  CrashTerminalOwner \/
  RehydrateTerminalFence \/
  CanonicalMembershipExpands \/
  CapturedProjectionTemporarilyOmitsMember \/
  BeginSequentialGeneration

Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ WF_vars(PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity))
  /\ WF_vars(PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery))
  /\ WF_vars(PreserveTerminalProtocol(FirstSpreadSatisfied))
  /\ WF_vars(PreserveTerminalProtocol(PublishSeedGeneration))
  /\ WF_vars(PreserveTerminalProtocol(AcknowledgeDurableReadback))
  /\ WF_vars(PreserveTerminalProtocol(SpreadGapReopens))
  /\ WF_vars(PreserveTerminalProtocol(ConfirmOneDurableNodeIncarnation))
  /\ WF_vars(PreserveTerminalProtocol(ConsumeSeedGenerationOnOneJoiner))
  /\ WF_vars(PreserveTerminalProtocol(StableWindowEvent))
  /\ WF_vars(PreserveTerminalProtocol(PublishOneReadyLease))
  /\ WF_vars(AcknowledgeReopenedActive)
  /\ WF_vars(CompleteReopenedReadyCohort)
  /\ WF_vars(PublishTerminalIntent)
  /\ WF_vars(AcknowledgeTerminalReadback)
  /\ WF_vars(RehydratePendingTerminalFromDurableActive)
  /\ WF_vars(RehydratePendingTerminalFromDurableTerminal)
  /\ WF_vars(PreserveTerminalProtocol(StaleDurableActiveReplayCompletes))
  /\ WF_vars(PreserveTerminalProtocol(RehydrateSameBootGeneration))
  /\ WF_vars(RehydrateTerminalFence)
  /\ WF_vars(CompatibleProjectionSynchronization)
  /\ WF_vars(CanonicalMembershipExpands)
  /\ WF_vars(CapturedProjectionTemporarilyOmitsMember)
  /\ WF_vars(PreserveTerminalProtocol(AttemptUncapturedConsumer))
  /\ WF_vars(BeginSequentialGeneration)

PreDurableTerminalRestartNext ==
  PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity) \/
  PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery) \/
  PreserveTerminalProtocol(FirstSpreadSatisfied) \/
  PreserveTerminalProtocol(SpreadGapReopens) \/
  CapturedPeerIncarnationChanges \/
  LosePreDurableTerminalIntentOnAuthorityRestart

PreDurableTerminalRestartSpec ==
  /\ Init
  /\ [][PreDurableTerminalRestartNext]_vars
  /\ WF_vars(PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity))
  /\ WF_vars(PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery))
  /\ WF_vars(PreserveTerminalProtocol(FirstSpreadSatisfied))
  /\ WF_vars(PreserveTerminalProtocol(SpreadGapReopens))
  /\ WF_vars(CapturedPeerIncarnationChanges)
  /\ WF_vars(LosePreDurableTerminalIntentOnAuthorityRestart)

DurablePendingTerminalRestartNext ==
  PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity) \/
  PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery) \/
  PreserveTerminalProtocol(FirstSpreadSatisfied) \/
  PreserveTerminalProtocol(PublishSeedGeneration) \/
  PreserveTerminalProtocol(SpreadGapReopens) \/
  CapturedPeerIncarnationChanges \/
  InvalidateDurablePendingTerminalOnAuthorityRestart

DurablePendingTerminalRestartSpec ==
  /\ Init
  /\ [][DurablePendingTerminalRestartNext]_vars
  /\ WF_vars(PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity))
  /\ WF_vars(PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery))
  /\ WF_vars(PreserveTerminalProtocol(FirstSpreadSatisfied))
  /\ WF_vars(PreserveTerminalProtocol(PublishSeedGeneration))
  /\ WF_vars(PreserveTerminalProtocol(SpreadGapReopens))
  /\ WF_vars(CapturedPeerIncarnationChanges)
  /\ WF_vars(InvalidateDurablePendingTerminalOnAuthorityRestart)

ProjectionSynchronizationSpreadGapReopens ==
  SpreadGapReopens /\ projectionSynchronizationExercised /\
  ownerReloadExercised /\ ownerAvailable

ProjectionSynchronizationCrash ==
  CrashInteractionOwner /\ projectionSynchronizationExercised /\ ~sawReopen

ProjectionSynchronizationRehydrate ==
  RehydrateSameBootGeneration /\ projectionSynchronizationExercised /\
  ownerReloadExercised /\ ~sawReopen

ProjectionSynchronizationAfterDurableReopen(Action) ==
  /\ projectionSynchronizationExercised
  /\ ownerReloadExercised
  /\ ownerAvailable
  /\ sawReopen
  /\ durableReopenAck
  /\ Action

ProjectionSynchronizationNext ==
  PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity) \/
  PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery) \/
  PreserveTerminalProtocol(FirstSpreadSatisfied) \/
  PreserveTerminalProtocol(PublishSeedGeneration) \/
  PreserveTerminalProtocol(AcknowledgeDurableReadback) \/
  CompatibleProjectionSynchronization \/
  PreserveTerminalProtocol(ProjectionSynchronizationCrash) \/
  PreserveTerminalProtocol(ProjectionSynchronizationRehydrate) \/
  PreserveTerminalProtocol(ProjectionSynchronizationSpreadGapReopens) \/
  AcknowledgeReopenedActive \/
  PreserveTerminalProtocol(ProjectionSynchronizationAfterDurableReopen(
    ConfirmOneDurableNodeIncarnation)) \/
  PreserveTerminalProtocol(ProjectionSynchronizationAfterDurableReopen(
    ConsumeSeedGenerationOnOneJoiner)) \/
  PreserveTerminalProtocol(ProjectionSynchronizationAfterDurableReopen(
    StableWindowEvent)) \/
  PreserveTerminalProtocol(ProjectionSynchronizationAfterDurableReopen(
    PublishOneReadyLease)) \/
  CompleteReopenedReadyCohort \/
  PublishTerminalIntent \/
  AcknowledgeTerminalReadback

ProjectionSynchronizationSpec ==
  /\ Init
  /\ [][ProjectionSynchronizationNext]_vars
  /\ WF_vars(PreserveTerminalProtocol(ObserveOneCurrentPrimaryIdentity))
  /\ WF_vars(PreserveTerminalProtocol(ObserveSeedBaseProjectionForDiscovery))
  /\ WF_vars(PreserveTerminalProtocol(FirstSpreadSatisfied))
  /\ WF_vars(PreserveTerminalProtocol(PublishSeedGeneration))
  /\ WF_vars(PreserveTerminalProtocol(AcknowledgeDurableReadback))
  /\ WF_vars(CompatibleProjectionSynchronization)
  /\ WF_vars(PreserveTerminalProtocol(ProjectionSynchronizationCrash))
  /\ WF_vars(PreserveTerminalProtocol(ProjectionSynchronizationRehydrate))
  /\ WF_vars(PreserveTerminalProtocol(
       ProjectionSynchronizationSpreadGapReopens))
  /\ WF_vars(AcknowledgeReopenedActive)
  /\ WF_vars(PreserveTerminalProtocol(
       ProjectionSynchronizationAfterDurableReopen(
         ConfirmOneDurableNodeIncarnation)))
  /\ WF_vars(PreserveTerminalProtocol(
       ProjectionSynchronizationAfterDurableReopen(
         ConsumeSeedGenerationOnOneJoiner)))
  /\ WF_vars(PreserveTerminalProtocol(
       ProjectionSynchronizationAfterDurableReopen(StableWindowEvent)))
  /\ WF_vars(PreserveTerminalProtocol(
       ProjectionSynchronizationAfterDurableReopen(PublishOneReadyLease)))
  /\ WF_vars(CompleteReopenedReadyCohort)
  /\ WF_vars(PublishTerminalIntent)
  /\ WF_vars(AcknowledgeTerminalReadback)

TypeInvariant ==
  /\ MinimumCohortSize \in Nat \ {0}
  /\ TerminalReplayFenceEnabled \in BOOLEAN
  /\ CohortSize \in Nat \ {0}
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
  /\ terminalReloadExercised \in BOOLEAN
  /\ durableReopenAck \in BOOLEAN
  /\ terminalIntent \in {0, 3, 4}
  /\ terminalPublished \in BOOLEAN
  /\ terminalDurableAck \in BOOLEAN
  /\ pendingTerminalReloadExercised \in BOOLEAN
  /\ preDurableTerminalRestartExercised \in BOOLEAN
  /\ durablePendingTerminalRestartExercised \in BOOLEAN
  /\ staleWriterAttempted \in BOOLEAN
  /\ membershipExpanded \in BOOLEAN
  /\ projectionOmissionExercised \in BOOLEAN
  /\ projectionSynchronizationExercised \in BOOLEAN
  /\ seedBaseProjectionObserved \in BOOLEAN
  /\ uncapturedConsumerAttempted \in BOOLEAN
  /\ uncapturedReleaseAuthorized \in BOOLEAN
  /\ completedGenerationCount \in 0..1

ReleaseRequiresDurableAck ==
  releaseAuthority =>
    generationPublished /\ durableAck /\ ownerAvailable /\
    capturedIdentityCount = CohortSize /\
    capturedAuthorityBoot = authorityBoot /\
    durableAuthorityBoot = authorityBoot

BaseProjectionNeverAuthorizesRelease ==
  (seedBaseProjectionObserved /\ ~durableAck) => ~releaseAuthority

PublishedGenerationIsIdentityBound ==
  generationPublished =>
    capturedIdentityCount >= MinimumCohortSize /\
    capturedIdentityCount = CohortSize /\
    capturedAuthorityBoot > 0 /\
    durableAuthorityBoot = capturedAuthorityBoot

PublishedTerminalIsIdentityBound ==
  terminalPublished =>
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

CanonicalExpansionCannotRevokePhysicalCohort ==
  (membershipExpanded /\
   ownerAvailable /\
   ~incarnationChanged /\
   readyCount < CohortSize) =>
    releaseAuthority

ProjectionOmissionCannotRevokePhysicalCohort ==
  (projectionOmissionExercised /\
   ownerAvailable /\
   ~incarnationChanged /\
   readyCount < CohortSize) =>
    releaseAuthority

ProjectionSynchronizationCannotRevokePhysicalCohort ==
  (projectionSynchronizationExercised /\
   ~sawReopen /\
   ownerAvailable /\
   ~incarnationChanged /\
   readyCount < CohortSize) =>
    releaseAuthority

SeedProjectionBypassesBlockedDistributedRead ==
  (LiveActiveReleaseSubstate /\
   consumerCount > 0 /\
   ~DistributedPublicationReadAvailable) =>
    SeedProjectionTransportEnabled /\ releaseAuthority

ReleaseRetainedAcrossReopen ==
  (LiveActiveReleaseSubstate /\
   sawReopen /\
   durableAck /\
   readyCount < CohortSize) =>
    releaseAuthority

ReleaseClosesOnlyAfterReady ==
  (phase = 3) => (readyCount = CohortSize /\ ~releaseAuthority)

SimultaneousReopenRetainsOneActiveProjection ==
  (LiveActiveReleaseSubstate /\
   sawReopen /\
   readyCount = CohortSize) =>
    releaseAuthority

PendingTerminalNeverAuthorizes ==
  (terminalIntent \in {3, 4} /\ ~terminalDurableAck) =>
    (phase = 2 /\ ~releaseAuthority)

PreDurableTerminalRestartIsDisjoint ==
  preDurableTerminalRestartExercised =>
    (~generationPublished /\ ~terminalPublished /\ authorityBoot = 2 /\
     incarnationChanged /\ phase = 4 /\ terminalIntent = 0 /\
     ~releaseAuthority)

DurablePendingTerminalRestartIsDisjoint ==
  durablePendingTerminalRestartExercised =>
    ((generationPublished \/ terminalPublished) /\
     authorityBoot = 2 /\ incarnationChanged /\ phase = 4 /\
     terminalIntent = 0 /\ ~releaseAuthority)

PendingTerminalAuthorityRestartIsDisjoint ==
  (preDurableTerminalRestartExercised \/
   durablePendingTerminalRestartExercised) =>
    (authorityBoot = 2 /\ incarnationChanged /\ phase = 4 /\
     terminalIntent = 0 /\ ~releaseAuthority)

PreDurableTerminalRestartEventuallyExercised ==
  <> preDurableTerminalRestartExercised

DurablePendingTerminalRestartEventuallyExercised ==
  <> durablePendingTerminalRestartExercised

CompleteRequiresDurableCausalChain ==
  (phase = 3) =>
    (durableReopenAck /\ terminalIntent = 3 /\ terminalDurableAck)

CommittedTerminalRequiresReadback ==
  (phase \in {3, 4} /\ terminalIntent \in {3, 4}) =>
    terminalPublished /\ terminalDurableAck

TerminalReplayCannotReopen ==
  staleWriterAttempted => (phase \in {3, 4} /\ ~releaseAuthority)

TerminalReloadPreservesFence ==
  (terminalReloadExercised /\ ownerAvailable) =>
    (phase \in {3, 4} /\ terminalDurableAck /\ ~releaseAuthority)

CapturedJoinerEventuallyConsumesIdentityBoundSeedProjection ==
  <> (incarnationChanged \/
      (consumerCount > 0 /\ durableAuthorityBoot = authorityBoot))

ProjectionSynchronizationEventuallyRetained ==
  <> (projectionSynchronizationExercised /\ ~sawReopen /\ releaseAuthority)

ProjectionSynchronizationEventuallyCompletesWithinBudget ==
  <> (projectionSynchronizationExercised /\ ownerReloadExercised /\
      ownerAvailable /\ sawReopen /\
      readyCount = CohortSize /\ phase = 3 /\ terminalDurableAck /\
      elapsedTicks <= BarrierBudgetTicks)

JoinerCohortEventuallyReadyWithinBudget ==
  <> (incarnationChanged \/
      (sawReopen /\ readyCount = CohortSize /\
       elapsedTicks <= BarrierBudgetTicks))

SequentialGenerationsEventuallyCloseWithinBudget ==
  <> (incarnationChanged \/
      (completedGenerationCount = 1 /\ phase = 3 /\
       readyCount = CohortSize /\ elapsedTicks <= BarrierBudgetTicks))

ActiveOwnerDowntime ==
  phase = 2 /\
  terminalIntent = 0 /\
  consumerCount > 0 /\
  ownerReloadExercised /\
  ~ownerAvailable /\
  ~incarnationChanged

PendingTerminalOwnerDowntime ==
  phase = 2 /\
  terminalIntent \in {3, 4} /\
  pendingTerminalReloadExercised /\
  ~ownerAvailable

OwnerDowntimeEventuallyResolves ==
  [] (ActiveOwnerDowntime =>
      <> (incarnationChanged \/
          (ownerAvailable /\ releaseAuthority /\
           durableAuthorityBoot = authorityBoot)))

PendingTerminalDowntimeEventuallyResolves ==
  [] (PendingTerminalOwnerDowntime =>
      <> (incarnationChanged \/
          (ownerAvailable /\ ~releaseAuthority /\
           terminalIntent \in {3, 4})))

=============================================================================
