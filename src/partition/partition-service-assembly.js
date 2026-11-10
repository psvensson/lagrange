/**
 * The partition replica's service, assembled by explicit context: each
 * method delegates to the module that owns its responsibility (functions
 * taking the service first). Internal calls dispatch through the service, so
 * one instance answers every question and an instance-own override still
 * takes effect. Nothing is copied onto the prototype.
 */
import * as durabilityFitness from './partition-service-durability-fitness.js';
import * as leadershipTransfer from './partition-service-leadership-transfer.js';
import * as promotionCountCheck from './partition-service-learner-promotion-count-check-methods.js';
import * as learnerPromotion from './partition-service-learner-promotion-methods.js';
import * as promotionProof from './partition-service-learner-promotion-proof-methods.js';
import * as promotionWake from './partition-service-learner-promotion-wake-methods.js';
import * as lifecycle from './partition-service-lifecycle-methods.js';
import * as mergeReplicationMethods from './partition-service-merge-replication-methods.js';
import * as mergeResumption from './partition-service-merge-replication-resumption-methods.js';
import * as metadataDelivery from './partition-service-metadata-delivery-methods.js';
import * as rebalancerWiring from './partition-service-rebalancer-methods.js';
import * as sourceReplicationStart from './partition-service-source-replication-start-methods.js';
import * as splitMirrorQueue from './partition-service-split-mirror-queue-methods.js';
import * as transactionCadence from './partition-service-participant-transaction-cadence-methods.js';
import * as removalServing from './partition-service-removal-serving-methods.js';
import * as remoteQuery from './partition-service-remote-query-methods.js';
import * as hydrationImage from './partition-service-hydration-image-methods.js';
import * as leaderActivation from './partition-service-leader-activation-methods.js';
import {PartitionServiceSplitAccessorBase} from './partition-service-split-accessor-base.js';
import {getStagingReplayStats} from './partition-participant-transaction-staging.js';
import {configureParticipantDeterminismSelfCheck} from
  './partition-participant-transaction-self-check.js';
import {readTransactionEnvelopeDiagnostics} from
  './partition-transaction-execution-envelope.js';

class PartitionService extends PartitionServiceSplitAccessorBase {
  constructor(options = {}) {
    super(options);
    // The leader's determinism self-check (TX1 design 3.3): the construction
    // option transactionDeterminismSelfCheck, else the classifier owner's.
    configureParticipantDeterminismSelfCheck(this,
      options.transactionDeterminismSelfCheck);
  }
  getStagingReplayStats() {
    return getStagingReplayStats(this);
  }
  readTransactionEnvelopeDiagnostics() {
    return readTransactionEnvelopeDiagnostics(this);
  }
  isSoloReplicaGroup() {
    return durabilityFitness.isSoloReplicaGroup(this);
  }
  getLeaderDurabilityFitnessState() {
    return durabilityFitness.getLeaderDurabilityFitnessState(this);
  }
  setLeaderDurabilityUnfitHook(hook) {
    return durabilityFitness.setLeaderDurabilityUnfitHook(this, hook);
  }
  setLeaderDurabilitySuccessorProbe(probe) {
    return durabilityFitness.setLeaderDurabilitySuccessorProbe(this, probe);
  }
  hasViableLeaderDurabilitySuccessor(nowMs) {
    return durabilityFitness.hasViableLeaderDurabilitySuccessor(this, nowMs);
  }
  shouldDemoteSuccessorlessUnfitLeader(nowMs, state, isLeader) {
    return durabilityFitness.shouldDemoteSuccessorlessUnfitLeader(this, nowMs, state, isLeader);
  }
  enforceLeaderDurabilityFitness(nowMs) {
    return durabilityFitness.enforceLeaderDurabilityFitness(this, nowMs);
  }
  observeLeaderDurabilitySignals(nowMs, state) {
    return durabilityFitness.observeLeaderDurabilitySignals(this, nowMs, state);
  }
  resolveLeaderDurabilityUnfitConsequence(nowMs, state, options3) {
    return durabilityFitness.resolveLeaderDurabilityUnfitConsequence(this, nowMs, state, options3);
  }
  demoteDurabilityUnfitLeader(nowMs, state, evidence, successorViable) {
    return durabilityFitness.demoteDurabilityUnfitLeader(
      this, nowMs, state, evidence, successorViable);
  }
  requestLeadershipTransfer(successor) {
    return leadershipTransfer.requestLeadershipTransfer(this, successor);
  }
  readPriorityRecoveryReadinessForLearnerPromotion() {
    return promotionCountCheck.readPriorityRecoveryReadinessForLearnerPromotion(this);
  }
  resolvePriorityRecoveryCompletionForLearnerPromotion(options) {
    return promotionCountCheck.resolvePriorityRecoveryCompletionForLearnerPromotion(this, options);
  }
  observeLearnerPromotionCountCheck() {
    return promotionCountCheck.observeLearnerPromotionCountCheck(this);
  }
  resolveSpreadCureTransitionAuthorizationForPromotion(observation, decision) {
    return promotionCountCheck.resolveSpreadCureTransitionAuthorizationForPromotion(
      this, observation, decision);
  }
  buildLearnerPromotionCountCheckPayload(observation, decision) {
    return promotionCountCheck.buildLearnerPromotionCountCheckPayload(this, observation, decision);
  }
  logFirstLearnerPromotionCountCheckPass(observation, decision) {
    return promotionCountCheck.logFirstLearnerPromotionCountCheckPass(this, observation, decision);
  }
  scheduleLearnerPromotion(scheduleReason) {
    return learnerPromotion.scheduleLearnerPromotion(this, scheduleReason);
  }
  getPriorityRecoveryPlanningSnapshotForLearnerPromotion(readinessService) {
    return learnerPromotion.getPriorityRecoveryPlanningSnapshotForLearnerPromotion(
      this, readinessService);
  }
  getPriorityRecoveryOperationContextsForLearnerPromotion() {
    return learnerPromotion.getPriorityRecoveryOperationContextsForLearnerPromotion(this);
  }
  getPartitionServiceRowsForPromotion() {
    return learnerPromotion.getPartitionServiceRowsForPromotion(this);
  }
  getReplicaServiceStatusForPromotion(serviceRow) {
    return learnerPromotion.getReplicaServiceStatusForPromotion(this, serviceRow);
  }
  isLiveReplicaServiceRowForPromotion(serviceRow) {
    return learnerPromotion.isLiveReplicaServiceRowForPromotion(this, serviceRow);
  }
  isLocalReplicaServiceRowForPromotion(serviceRow) {
    return learnerPromotion.isLocalReplicaServiceRowForPromotion(this, serviceRow);
  }
  getReplicaServiceRowReplicaIdForPromotion(serviceRow) {
    return learnerPromotion.getReplicaServiceRowReplicaIdForPromotion(this, serviceRow);
  }
  isLearnerServiceRowForPromotion(serviceRow) {
    return learnerPromotion.isLearnerServiceRowForPromotion(this, serviceRow);
  }
  isActiveVoterServiceRowForPromotion(serviceRow) {
    return learnerPromotion.isActiveVoterServiceRowForPromotion(this, serviceRow);
  }
  resolveOperationScopedLearnerCountForPromotion(inFlightAddLikeReplicaIds) {
    return learnerPromotion.resolveOperationScopedLearnerCountForPromotion(
      this, inFlightAddLikeReplicaIds);
  }
  resolveLearnerPromotionCounts(observedCounts) {
    return learnerPromotion.resolveLearnerPromotionCounts(this, observedCounts);
  }
  resolveActiveLearnerNodeIdsForPromotion(serviceLearnerNodeIds) {
    return learnerPromotion.resolveActiveLearnerNodeIdsForPromotion(this, serviceLearnerNodeIds);
  }
  becomeFollower() {
    return learnerPromotion.becomeFollower(this);
  }
  checkLearnerPromotion() {
    return learnerPromotion.checkLearnerPromotion(this);
  }
  runLearnerPromotionCheck() {
    return learnerPromotion.runLearnerPromotionCheck(this);
  }
  applyLearnerPromotionProofGate() {
    return learnerPromotion.applyLearnerPromotionProofGate(this);
  }
  readInFlightAddLikeOperationRowsForPromotion() {
    return learnerPromotion.readInFlightAddLikeOperationRowsForPromotion(this);
  }
  collectInFlightAddLikeOperationsForPromotion() {
    return learnerPromotion.collectInFlightAddLikeOperationsForPromotion(this);
  }
  collectPendingLearnerCensusForPromotion() {
    return learnerPromotion.collectPendingLearnerCensusForPromotion(this);
  }
  countPendingLearners() {
    return learnerPromotion.countPendingLearners(this);
  }
  resolveTargetReplicaCountForPromotion() {
    return learnerPromotion.resolveTargetReplicaCountForPromotion(this);
  }
  getTargetReplicaCountForPromotion() {
    return learnerPromotion.getTargetReplicaCountForPromotion(this);
  }
  collectActiveVoterCensusForPromotion() {
    return learnerPromotion.collectActiveVoterCensusForPromotion(this);
  }
  countActiveVoters() {
    return learnerPromotion.countActiveVoters(this);
  }
  resolveLearnerPromotionMembershipEpoch() {
    return promotionProof.resolveLearnerPromotionMembershipEpoch(this);
  }
  handleLearnerPromotionProofRequest(payload) {
    return promotionProof.handleLearnerPromotionProofRequest(this, payload);
  }
  refuseLearnerPromotionProofRequest(requestShape, cause, detail) {
    return promotionProof.refuseLearnerPromotionProofRequest(this, requestShape, cause, detail);
  }
  probeLearnerReplicationProgress(learnerAddress) {
    return promotionProof.probeLearnerReplicationProgress(this, learnerAddress);
  }
  requestLearnerPromotionProofFromLeader(promotionObservation) {
    return promotionProof.requestLearnerPromotionProofFromLeader(this, promotionObservation);
  }
  refuseLearnerPromotionProofResponse(reason, cause, promotionObservation, detail) {
    return promotionProof.refuseLearnerPromotionProofResponse(
      this, reason, cause, promotionObservation, detail);
  }
  resolveLearnerPromotionProofDeliveryTimeoutMs() {
    return promotionProof.resolveLearnerPromotionProofDeliveryTimeoutMs(this);
  }
  resolveLeaderAddressForPromotionProof() {
    return promotionProof.resolveLeaderAddressForPromotionProof(this);
  }
  learnerPromotionProofResponseBindsThisLearner(delivery) {
    return promotionProof.learnerPromotionProofResponseBindsThisLearner(this, delivery);
  }
  seedLearnerPromotionWakeObservation() {
    return promotionWake.seedLearnerPromotionWakeObservation(this);
  }
  observeLearnerPromotionWakeSource(tableName, _operation, record) {
    return promotionWake.observeLearnerPromotionWakeSource(this, tableName, _operation, record);
  }
  observeOwnServicesRowForLearnerPromotion(record) {
    return promotionWake.observeOwnServicesRowForLearnerPromotion(this, record);
  }
  observePublishedEpochForLearnerPromotion() {
    return promotionWake.observePublishedEpochForLearnerPromotion(this);
  }
  wakeLearnerPromotion(wakeReason) {
    return promotionWake.wakeLearnerPromotion(this, wakeReason);
  }
  drainLearnerPromotionWake() {
    return promotionWake.drainLearnerPromotionWake(this);
  }
  reactToLearnerPromotionRefusalCause(proof) {
    return promotionWake.reactToLearnerPromotionRefusalCause(this, proof);
  }
  quiesceRebalancing() {
    return lifecycle.quiesceRebalancing(this);
  }
  getStats() {
    return lifecycle.getStats(this);
  }
  shutdown() {
    return lifecycle.shutdown(this);
  }
  normalizeMergeTransitionMetadata(rawMetadata) {
    return mergeReplicationMethods.normalizeMergeTransitionMetadata(this, rawMetadata);
  }
  handleMergeReplicationRunFailure(metadata, error, mergeReplication) {
    return mergeReplicationMethods.handleMergeReplicationRunFailure(
      this, metadata, error, mergeReplication);
  }
  resolveMergeFailureAckStatus() {
    return mergeReplicationMethods.resolveMergeFailureAckStatus(this);
  }
  forwardStartMergeReplicationToLeader(payload, transitionMetadata) {
    return mergeReplicationMethods.forwardStartMergeReplicationToLeader(
      this, payload, transitionMetadata);
  }
  runMergeReplicationWorkflow(options) {
    return mergeReplicationMethods.runMergeReplicationWorkflow(this, options);
  }
  emitMergeSourceAck(metadata, ackStatus, checkpoint) {
    return mergeReplicationMethods.emitMergeSourceAck(this, metadata, ackStatus, checkpoint);
  }
  resolveMergeDescriptorEpochEvidence(metadata) {
    return mergeReplicationMethods.resolveMergeDescriptorEpochEvidence(this, metadata);
  }
  assertMergeRoutingDescriptorEpoch(metadata) {
    return mergeReplicationMethods.assertMergeRoutingDescriptorEpoch(this, metadata);
  }
  backfillMergeSnapshot(snapshotDb, metadata) {
    return mergeReplicationMethods.backfillMergeSnapshot(this, snapshotDb, metadata);
  }
  applyMergeSnapshotBatch(rows, columns, metadata) {
    return mergeReplicationMethods.applyMergeSnapshotBatch(this, rows, columns, metadata);
  }
  routeMergeMirroredWrite(metadata, sql, params, options) {
    return mergeReplicationMethods.routeMergeMirroredWrite(this, metadata, sql, params, options);
  }
  enqueueMergeDeltaBounded(mergeReplication, entry) {
    return mergeReplicationMethods.enqueueMergeDeltaBounded(this, mergeReplication, entry);
  }
  handleMergeReplicationAfterWrite(entry) {
    return mergeReplicationMethods.handleMergeReplicationAfterWrite(this, entry);
  }
  mirrorCutoverActiveMergeWrite(entry, mergeReplication) {
    return mergeReplicationMethods.mirrorCutoverActiveMergeWrite(this, entry, mergeReplication);
  }
  drainMergeReplicationQueueQuietly(mergeReplication) {
    return mergeReplicationMethods.drainMergeReplicationQueueQuietly(this, mergeReplication);
  }
  flushMergeReplicationQueue() {
    return mergeReplicationMethods.flushMergeReplicationQueue(this);
  }
  drainMergeReplicationQueue(mergeReplication) {
    return mergeReplicationMethods.drainMergeReplicationQueue(this, mergeReplication);
  }
  replayMergeEntry(entry, metadata) {
    return mergeReplicationMethods.replayMergeEntry(this, entry, metadata);
  }
  waitForMergeCutoverActivation(metadata) {
    return mergeReplicationMethods.waitForMergeCutoverActivation(this, metadata);
  }
  isMergeTransitionAborted() {
    return mergeReplicationMethods.isMergeTransitionAborted(this);
  }
  resolveLocalTableDescriptor() {
    return mergeReplicationMethods.resolveLocalTableDescriptor(this);
  }
  isMergeCutoverActive(metadata) {
    return mergeReplicationMethods.isMergeCutoverActive(this, metadata);
  }
  startOrResumeMergeReplicationFromDurable() {
    return mergeResumption.startOrResumeMergeReplicationFromDurable(this);
  }
  queueRoleUpdate(role) {
    return metadataDelivery.queueRoleUpdate(this, role);
  }
  queueLeaderNodeUpdate(leaderNodeId, raftTerm) {
    return metadataDelivery.queueLeaderNodeUpdate(this, leaderNodeId, raftTerm);
  }
  seedLocalCanonicalLeaderNodeId(leaderNodeId, raftTerm) {
    return metadataDelivery.seedLocalCanonicalLeaderNodeId(this, leaderNodeId, raftTerm);
  }
  clearLocalCanonicalLeaderNodeIdIfOwned() {
    return metadataDelivery.clearLocalCanonicalLeaderNodeIdIfOwned(this);
  }
  clearLocalCanonicalLeaderClaimOnTeardown() {
    return metadataDelivery.clearLocalCanonicalLeaderClaimOnTeardown(this);
  }
  applyLocalLeaderClaimAnnotationClear(existingRow, transition) {
    return metadataDelivery.applyLocalLeaderClaimAnnotationClear(this, existingRow, transition);
  }
  applyLocalCanonicalLeaderProjection(existingRow, localProjection, transition) {
    return metadataDelivery.applyLocalCanonicalLeaderProjection(
      this, existingRow, localProjection, transition);
  }
  handleCanonicalLeaderRowCacheChange(record) {
    return metadataDelivery.handleCanonicalLeaderRowCacheChange(this, record);
  }
  applyLocalCanonicalLeaderObservation(existingRow, leaderNodeId, transition) {
    return metadataDelivery.applyLocalCanonicalLeaderObservation(
      this, existingRow, leaderNodeId, transition);
  }
  reassertDurableLeaderNodeId() {
    return metadataDelivery.reassertDurableLeaderNodeId(this);
  }
  flushRoleUpdate() {
    return metadataDelivery.flushRoleUpdate(this);
  }
  reassertDurableRaftRole() {
    return metadataDelivery.reassertDurableRaftRole(this);
  }
  flushLeaderNodeUpdate() {
    return metadataDelivery.flushLeaderNodeUpdate(this);
  }
  isPartitionsLeaderAvailable() {
    return metadataDelivery.isPartitionsLeaderAvailable(this);
  }
  isServicesLeaderAvailable() {
    return metadataDelivery.isServicesLeaderAvailable(this);
  }
  getMetadataPublicationDeliveryPriority() {
    return metadataDelivery.getMetadataPublicationDeliveryPriority(this);
  }
  getMetadataPublicationWorkClass() {
    return metadataDelivery.getMetadataPublicationWorkClass(this);
  }
  shouldMetadataPublicationAllowPressureDefer() {
    return metadataDelivery.shouldMetadataPublicationAllowPressureDefer(this);
  }
  getMetadataPublicationReadinessDimension() {
    return metadataDelivery.getMetadataPublicationReadinessDimension();
  }
  triggerRebalanceCheck(reason) {
    return metadataDelivery.triggerRebalanceCheck(this, reason);
  }
  extractAckFromResponse(result, requestId) {
    return metadataDelivery.extractAckFromResponse(this, result, requestId);
  }
  deliverWithAck(transport, targetAddress, message, timeoutMs) {
    return metadataDelivery.deliverWithAck(this, transport, targetAddress, message, timeoutMs);
  }
  buildRebalancerDependencyBundle() {
    return rebalancerWiring.buildRebalancerDependencyBundle(this);
  }
  applyRebalancerDependencies(bundle) {
    return rebalancerWiring.applyRebalancerDependencies(this, bundle);
  }
  maybeInitializeRebalancer(options) {
    return rebalancerWiring.maybeInitializeRebalancer(this, options);
  }
  initializeRebalancer(bundle) {
    return rebalancerWiring.initializeRebalancer(this, bundle);
  }
  isSameSplitReplication(left, right) {
    return sourceReplicationStart.isSameSplitReplication(this, left, right);
  }
  isSameMergeReplication(left, right) {
    return sourceReplicationStart.isSameMergeReplication(this, left, right);
  }
  handleStartSplitReplication(payload) {
    return sourceReplicationStart.handleStartSplitReplication(this, payload);
  }
  startSplitReplicationHandle(handle) {
    return sourceReplicationStart.startSplitReplicationHandle(this, handle);
  }
  authorizeAndRunSplitReplication(handle) {
    return sourceReplicationStart.authorizeAndRunSplitReplication(this, handle);
  }
  waitForSplitReplicationStart(handle) {
    return sourceReplicationStart.waitForSplitReplicationStart(this, handle);
  }
  discardProvisionalSplitReplication(handle) {
    return sourceReplicationStart.discardProvisionalSplitReplication(this, handle);
  }
  handleStartMergeReplication(payload) {
    return sourceReplicationStart.handleStartMergeReplication(this, payload);
  }
  startMergeReplicationHandle(handle) {
    return sourceReplicationStart.startMergeReplicationHandle(this, handle);
  }
  authorizeAndRunMergeReplication(handle) {
    return sourceReplicationStart.authorizeAndRunMergeReplication(this, handle);
  }
  waitForMergeReplicationStart(handle) {
    return sourceReplicationStart.waitForMergeReplicationStart(this, handle);
  }
  discardProvisionalMergeReplication(handle) {
    return sourceReplicationStart.discardProvisionalMergeReplication(this, handle);
  }
  prepareSourceReplicationHandle(handle) {
    return sourceReplicationStart.prepareSourceReplicationHandle(this, handle);
  }
  beginSourceReplicationActivity(handle) {
    return sourceReplicationStart.beginSourceReplicationActivity(this, handle);
  }
  finishSourceReplicationActivity(handle, activity) {
    return sourceReplicationStart.finishSourceReplicationActivity(this, handle, activity);
  }
  quiesceSourceReplicationHandle(handle) {
    return sourceReplicationStart.quiesceSourceReplicationHandle(this, handle);
  }
  handleSplitReplicationAfterWrite(entry) {
    return splitMirrorQueue.handleSplitReplicationAfterWrite(this, entry);
  }
  seedSplitReplayCursorFromDurableLog(splitReplication) {
    return splitMirrorQueue.seedSplitReplayCursorFromDurableLog(this, splitReplication);
  }
  enqueueSplitDeltaBounded(splitReplication, entry) {
    return splitMirrorQueue.enqueueSplitDeltaBounded(this, splitReplication, entry);
  }
  resumeDurableMirrorReplicationWorkers() {
    return splitMirrorQueue.resumeDurableMirrorReplicationWorkers(this);
  }
  startOrResumeSplitReplicationFromDurable() {
    return splitMirrorQueue.startOrResumeSplitReplicationFromDurable(this);
  }
  mirrorCutoverActiveSplitWrite(entry, splitReplication) {
    return splitMirrorQueue.mirrorCutoverActiveSplitWrite(this, entry, splitReplication);
  }
  drainSplitReplicationQueueQuietly(splitReplication) {
    return splitMirrorQueue.drainSplitReplicationQueueQuietly(this, splitReplication);
  }
  flushSplitReplicationQueue() {
    return splitMirrorQueue.flushSplitReplicationQueue(this);
  }
  drainSplitReplicationQueue(splitReplication) {
    return splitMirrorQueue.drainSplitReplicationQueue(this, splitReplication);
  }
  recordCommittedWriteForSnapshotCadence(count) {
    return transactionCadence.recordCommittedWriteForSnapshotCadence(this, count);
  }
  runSnapshotCadenceTick(nowMs) {
    return transactionCadence.runSnapshotCadenceTick(this, nowMs);
  }
  enforcePreparedStateHoldTimeouts(nowMs) {
    return transactionCadence.enforcePreparedStateHoldTimeouts(this, nowMs);
  }
  startPreparedStateHoldTimeoutSweep() {
    return transactionCadence.startPreparedStateHoldTimeoutSweep(this);
  }
  stopPreparedStateHoldTimeoutSweep() {
    return transactionCadence.stopPreparedStateHoldTimeoutSweep(this);
  }
  fenceServingAdmissionForRemoval() {
    return removalServing.fenceServingAdmissionForRemoval(this);
  }
  waitForRemovalServingDrain(options) {
    return removalServing.waitForRemovalServingDrain(this, options);
  }
  buildRemoteReadAuthorityWitness(isWriteOperation) {
    return remoteQuery.buildRemoteReadAuthorityWitness(this, isWriteOperation);
  }
  rejectStalePartitionEpochWrite(expectedVersion) {
    return remoteQuery.rejectStalePartitionEpochWrite(this, expectedVersion);
  }
  resolveLocalActivePartitionVersion() {
    return remoteQuery.resolveLocalActivePartitionVersion(this);
  }
  resolveEpochEvidenceGapOutcome(expectedVersion) {
    return remoteQuery.resolveEpochEvidenceGapOutcome(this, expectedVersion);
  }
  handleRemoteQuery(payload) {
    return remoteQuery.handleRemoteQuery(this, payload);
  }
  executeMigrationAlterQuery(sql, params, options) {
    return remoteQuery.executeMigrationAlterQuery(this, sql, params, options);
  }
  registerMigrationDefaultFromAlterSql(sql) {
    return remoteQuery.registerMigrationDefaultFromAlterSql(this, sql);
  }
  parseAddColumnDefaultFromAlterSql(sql) {
    return remoteQuery.parseAddColumnDefaultFromAlterSql(this, sql);
  }
  isWriteQuery(sql) {
    return remoteQuery.isWriteQuery(this, sql);
  }
  readHydrationImage(sql) {
    return hydrationImage.readHydrationImage(this, sql);
  }
  resolveRebalancerLeadership() {
    return leaderActivation.resolveRebalancerLeadership(this);
  }
  setRebalancerLeadershipSink(sink) {
    return leaderActivation.setRebalancerLeadershipSink(this, sink);
  }
  driveRebalancerLeadershipSink() {
    return leaderActivation.driveRebalancerLeadershipSink(this);
  }
  updateRebalancerLeadership() {
    return leaderActivation.updateRebalancerLeadership(this);
  }
  cancelLeaderOwnedActivation() {
    return leaderActivation.cancelLeaderOwnedActivation(this);
  }
  scheduleLeaderOwnedActivation(term) {
    return leaderActivation.scheduleLeaderOwnedActivation(this, term);
  }
}

export {PartitionService};
