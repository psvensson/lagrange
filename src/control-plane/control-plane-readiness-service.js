/**
 * Owner contract:
 * Owner: ControlPlaneReadinessService owns node readiness and planning surfaces.
 * Inputs: injected metadata owners, node rows, service rows, cache, runtime evidence.
 * Canonical output: readiness, membership-planning, startup, and recovery-health answers.
 * Prohibited fallbacks: no raw cache authority or sync owner bypass for planning state.
 * Primary tests: test/control-plane/control-plane-readiness-service.test.js.
 *
 * One class. Each method delegates to the explicit-context module that owns
 * its responsibility (functions taking the service first); internal calls
 * dispatch through the service, so one instance answers every question.
 */
import * as participation from './control-plane-readiness-participation-base.js';
import * as wiring from './control-plane-readiness-owner-dependencies.js';
import * as eligibility from './control-plane-readiness-diagnostics-eligibility.js';
import * as diagnostics from './control-plane-readiness-publication-diagnostics.js';
import * as evidence from './control-plane-readiness-evidence-reasons.js';
import * as planning from './control-plane-readiness-priority-recovery-planning.js';
import * as snapshot from './control-plane-readiness-publication-planning-snapshot.js';
import * as resolution from './control-plane-readiness-publication-planning-resolution.js';
import * as startup from './control-plane-readiness-startup-authority-health.js';
import * as rows from './control-plane-readiness-node-service-rows.js';
import {installControlPlaneReadinessPlanningOwnerDelegateMethods} from
  './control-plane-readiness-planning-owner-delegate-methods.js';
import {installControlPlaneReadinessNodeMethods} from
  './control-plane-readiness-service-node-methods.js';
import {installControlPlaneReadinessNodeLivenessMethods} from
  './control-plane-readiness-node-liveness-methods.js';
import {installControlPlaneReadinessSnapshotStoreMethods} from
  './control-plane-readiness-snapshot-store.js';
import {installControlPlaneReadinessRuntimeAuthorityMethods} from
  './control-plane-readiness-runtime-authority-methods.js';
import {installControlPlaneReadinessFormationReleaseMethods} from
  './control-plane-readiness-formation-release-methods.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from
  './control-plane-readiness-planning-shared.js';
const {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} = SHARED;

class ControlPlaneReadinessService {
  constructor(options = {}) {
    // The owner's own empty slots: no publication diagnostics memoized and
    // no formation-release handoff authority logged yet.
    this.membershipPublicationDiagnosticsMemo = null;
    this.lastFormationReleaseHandoffAuthorityLogSignature = null;
    participation.initializeControlPlaneReadinessState(this, options);
  }
  clearMembershipPublicationDiagnosticsMemo() {
    this.membershipPublicationDiagnosticsMemo = null;
  }
  getPriorityControlPlaneRecoveryState(context = {}) {
    const state = startup.getPriorityControlPlaneRecoveryState(this, context);
    return evidence.applyPriorityRecoveryTransportGrace(this, context,
      eligibility.gatePriorityControlPlaneRecoveryStateActivity(
        this, context, state,
      ),
    );
  }
  buildPriorityControlPlaneRecoveryUnavailableHealth(
    failureReason,
    error = null,
    context = null,
  ) {
    return evidence.withPriorityRecoveryTransportRetryHint(
      startup.buildPriorityControlPlaneRecoveryUnavailableHealth(
        this, failureReason, error, context,
      ),
      error,
    );
  }
  setFormationReleaseAuthorityNodeId(nodeId) {
    return participation.setFormationReleaseAuthorityNodeId(this, nodeId);
  }
  logMissingOwner(message, owner) {
    return participation.logMissingOwner(this, message, owner);
  }
  syncOwnerDependencies(options) {
    return wiring.syncOwnerDependencies(this, options);
  }
  getControlPlaneParticipation(nodeId, options) {
    return participation.getControlPlaneParticipation(this, nodeId, options);
  }
  getControlPlaneParticipationSync(nodeId, options) {
    return participation.getControlPlaneParticipationSync(this, nodeId, options);
  }
  buildControlPlaneParticipation(context) {
    return participation.buildControlPlaneParticipation(this, context);
  }
  recordParticipationDecision(decision) {
    return eligibility.recordParticipationDecision(this, decision);
  }
  getParticipationDecisionLedgerEntries(options) {
    return eligibility.getParticipationDecisionLedgerEntries(this, options);
  }
  recordAuthoritativeReadinessRepair(entry) {
    return eligibility.recordAuthoritativeReadinessRepair(this, entry);
  }
  getLatestAuthoritativeReadinessRepair(nodeId) {
    return eligibility.getLatestAuthoritativeReadinessRepair(this, nodeId);
  }
  getAuthoritativeReadinessRepairLedgerEntries(options) {
    return eligibility.getAuthoritativeReadinessRepairLedgerEntries(this, options);
  }
  getHeartbeatPublicationDiagnostics() {
    return eligibility.getHeartbeatPublicationDiagnostics(this);
  }
  getHeartbeatPublicationMode() {
    return eligibility.getHeartbeatPublicationMode(this);
  }
  hasFreshLocalReporterSuccess(nodeId) {
    return eligibility.hasFreshLocalReporterSuccess(this, nodeId);
  }
  shouldGraceTimedOutLocalReporterFailure(context) {
    return eligibility.shouldGraceTimedOutLocalReporterFailure(this, context);
  }
  getPublicationDiagnostics(observedAt) {
    return eligibility.getPublicationDiagnostics(this, observedAt);
  }
  buildServeAdmissionSnapshot(context) {
    return eligibility.buildServeAdmissionSnapshot(this, context);
  }
  resolveNormalizedProjectionReadinessContract(context, source, verdicts) {
    return eligibility.resolveNormalizedProjectionReadinessContract(
      this,
      context,
      source,
      verdicts,
    );
  }
  computeProjectionReadinessGeneration(context, source, verdicts) {
    return eligibility.computeProjectionReadinessGeneration(this, context, source, verdicts);
  }
  buildDimensionsEvaluation(context) {
    return eligibility.buildDimensionsEvaluation(this, context);
  }
  isControlPlaneRecoveryEligible(context) {
    return eligibility.isControlPlaneRecoveryEligible(this, context);
  }
  isPriorityControlPlaneRecoveryActive(membershipPublicationPlanningSnapshot) {
    return eligibility.isPriorityControlPlaneRecoveryActive(
      this,
      membershipPublicationPlanningSnapshot,
    );
  }
  resolveProvisioningEligibility(context) {
    return eligibility.resolveProvisioningEligibility(this, context);
  }
  isProvisioningConvergenceGraceActive(context) {
    return eligibility.isProvisioningConvergenceGraceActive(this, context);
  }
  isPublicationHealthy(publication) {
    return eligibility.isPublicationHealthy(this, publication);
  }
  isControlPlanePublished(membershipPublication) {
    return eligibility.isControlPlanePublished(this, membershipPublication);
  }
  getMembershipPublicationDiagnostics(nodeId, observedAt, readOptions) {
    return diagnostics.getMembershipPublicationDiagnostics(this, nodeId, observedAt, readOptions);
  }
  getMembershipPublicationDiagnosticsSync(nodeId, observedAt, readOptions) {
    return diagnostics.getMembershipPublicationDiagnosticsSync(
      this,
      nodeId,
      observedAt,
      readOptions,
    );
  }
  getControlPlanePublicationStory(nodeId, observedAt, readOptions) {
    return diagnostics.getControlPlanePublicationStory(this, nodeId, observedAt, readOptions);
  }
  getControlPlanePublicationStorySync(nodeId, observedAt, readOptions) {
    return diagnostics.getControlPlanePublicationStorySync(this, nodeId, observedAt, readOptions);
  }
  getMembershipPublicationPlanningSnapshot(nodeId, observedAt) {
    return diagnostics.getMembershipPublicationPlanningSnapshot(this, nodeId, observedAt);
  }
  readMembershipPlanningDerivationVersionKey(observedAt) {
    return diagnostics.readMembershipPlanningDerivationVersionKey(this, observedAt);
  }
  readMembershipPlanningDerivationMemoCurrency(nodeId, observedAt) {
    return diagnostics.readMembershipPlanningDerivationMemoCurrency(this, nodeId, observedAt);
  }
  deriveMembershipPublicationPlanningSnapshotSync(nodeId, observedAt) {
    return diagnostics.deriveMembershipPublicationPlanningSnapshotSync(this, nodeId, observedAt);
  }
  shouldAllowTransportBackedRecoveryGrace(context) {
    return evidence.shouldAllowTransportBackedRecoveryGrace(this, context);
  }
  buildReasons(context) {
    return evidence.buildReasons(this, context);
  }
  isLocalQueryTransportRoutableForNode(nodeId, nodeEvidence) {
    return evidence.isLocalQueryTransportRoutableForNode(this, nodeId, nodeEvidence);
  }
  isLocalQueryTransportBlockedForNode(nodeId, nodeEvidence) {
    return evidence.isLocalQueryTransportBlockedForNode(this, nodeId, nodeEvidence);
  }
  buildProjectionReadinessContract(context) {
    return evidence.buildProjectionReadinessContractForService(this, context);
  }
  buildEvaluatedNodeReadinessSnapshot(context) {
    return evidence.buildEvaluatedNodeReadinessSnapshot(this, context);
  }
  resolveMissingNodeReadinessState(context) {
    return evidence.resolveMissingNodeReadinessState(this, context);
  }
  getAuthoritativeControlPlaneView() {
    return evidence.getAuthoritativeControlPlaneView(this);
  }
  buildNodeEvidence(nodeId, nodeRow) {
    return evidence.buildNodeEvidence(this, nodeId, nodeRow);
  }
  buildMissingSelfNodeEvidence(nodeId) {
    return evidence.buildMissingSelfNodeEvidence(this, nodeId);
  }
  recordReadinessTransition(context) {
    return evidence.recordReadinessTransition(this, context);
  }
  getReadinessTransitionHistory(nodeId) {
    return evidence.getReadinessTransitionHistory(this, nodeId);
  }
  getReadinessTransitionHistoryByNodeId() {
    return evidence.getReadinessTransitionHistoryByNodeId(this);
  }
  buildReadinessTransitionState(context) {
    return evidence.buildReadinessTransitionState(this, context);
  }
  getLocalClusterIncarnationFence() {
    return planning.getLocalClusterIncarnationFence(this);
  }
  resolveLocalPlanningAdmissionEvidence(planningSnapshot) {
    return planning.resolveLocalPlanningAdmissionEvidence(this, planningSnapshot);
  }
  resolvePriorityRecoveryPlanningAnswer(nodeId, observedAt, planningSnapshot) {
    return planning.resolvePriorityRecoveryPlanningAnswer(
      this,
      nodeId,
      observedAt,
      planningSnapshot,
    );
  }
  readMemoizedPlanningAnswer(planningSnapshot, nodeId, generation, retainedAtEntry) {
    return planning.readMemoizedPlanningAnswer(
      this,
      planningSnapshot,
      nodeId,
      generation,
      retainedAtEntry,
    );
  }
  storeMemoizedPlanningAnswer(planningSnapshot, nodeId, generation, retainedAtEntry, answer) {
    return planning.storeMemoizedPlanningAnswer(
      this,
      planningSnapshot,
      nodeId,
      generation,
      retainedAtEntry,
      answer,
    );
  }
  resolvePriorityRecoveryPlanningAnswerUncached(nodeId, observedAt, planningSnapshot) {
    return planning.resolvePriorityRecoveryPlanningAnswerUncached(
      this,
      nodeId,
      observedAt,
      planningSnapshot,
    );
  }
  isPriorityRecoveryPlanningSnapshotIncomplete(planningSnapshot) {
    return planning.isPriorityRecoveryPlanningSnapshotIncomplete(this, planningSnapshot);
  }
  storeActivePriorityRecoveryPlanningSnapshot(nodeId, planningSnapshot, observedAt) {
    return planning.storeActivePriorityRecoveryPlanningSnapshot(
      this,
      nodeId,
      planningSnapshot,
      observedAt,
    );
  }
  getActivePriorityRecoveryPlanningSnapshot(nodeId, observedAt) {
    return planning.getActivePriorityRecoveryPlanningSnapshot(this, nodeId, observedAt);
  }
  clearActivePriorityRecoveryPlanningSnapshot(nodeId) {
    return planning.clearActivePriorityRecoveryPlanningSnapshot(this, nodeId);
  }
  getPriorityRecoveryPlanningPublicationEpoch(planningSnapshot) {
    return planning.getPriorityRecoveryPlanningPublicationEpoch(this, planningSnapshot);
  }
  getPriorityRecoveryDecisionSnapshotsPublicationEpoch(planningSnapshot) {
    return planning.getPriorityRecoveryDecisionSnapshotsPublicationEpoch(this, planningSnapshot);
  }
  shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
    directPlanningSnapshot,
    providedPlanningSnapshot,
  ) {
    return planning.shouldUseDirectReadyGateForMembershipPublicationPlanningMerge(
      this,
      directPlanningSnapshot,
      providedPlanningSnapshot,
    );
  }
  shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
    directPlanningSnapshot,
    providedPlanningSnapshot,
  ) {
    return planning.shouldUseProvidedReadyGateForMembershipPublicationPlanningMerge(
      this,
      directPlanningSnapshot,
      providedPlanningSnapshot,
    );
  }
  shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
    directPlanningSnapshot,
    providedPlanningSnapshot,
    publicationConvergenceGate,
  ) {
    return planning.shouldPreferDirectPublicationStatusForMembershipPublicationPlanningMerge(
      this,
      directPlanningSnapshot,
      providedPlanningSnapshot,
      publicationConvergenceGate,
    );
  }
  shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
    directPlanningSnapshot,
    providedPlanningSnapshot,
    publicationConvergenceGate,
  ) {
    return planning
      .shouldUseProvidedPriorityRecoveryDecisionSnapshotsForMembershipPublicationPlanningMerge(
        this,
        directPlanningSnapshot,
        providedPlanningSnapshot,
        publicationConvergenceGate,
      );
  }
  shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(planningSnapshot, retainedSnapshot) {
    return planning.shouldRetainMoreRecentActivePriorityRecoveryPlanningSnapshot(
      this,
      planningSnapshot,
      retainedSnapshot,
    );
  }
  getMembershipPublicationRecoveryGate(planningSnapshot) {
    return planning.getMembershipPublicationRecoveryGate(this, planningSnapshot);
  }
  resolvePlanningPendingAckEvidenceState(planningSnapshot, publicationRecoveryGate) {
    return planning.resolvePlanningPendingAckEvidenceState(
      this,
      planningSnapshot,
      publicationRecoveryGate,
    );
  }
  resolveRetainedPendingAckEvidenceState(
    planningSnapshot,
    retainedSnapshot,
    planningGate,
    retainedGate,
  ) {
    return planning.resolveRetainedPendingAckEvidenceState(
      this,
      planningSnapshot,
      retainedSnapshot,
      planningGate,
      retainedGate,
    );
  }
  filterPriorityRecoveryReasonCodesForPublicationGate(reasonCodes, publicationRecoveryGate) {
    return planning.filterPriorityRecoveryReasonCodesForPublicationGate(
      this,
      reasonCodes,
      publicationRecoveryGate,
    );
  }
  buildPriorityRecoveryPlanningProjection(planningSnapshot, observedAt) {
    return planning.buildPriorityRecoveryPlanningProjection(this, planningSnapshot, observedAt);
  }
  readPlanningProjectionGenerationForCall(observedAt, nodeId) {
    return planning.readPlanningProjectionGenerationForCall(this, observedAt, nodeId);
  }
  readCanonicalPlanningProjection(planningSnapshot, generation, admissionEvidenceSource) {
    return planning.readCanonicalPlanningProjection(
      this,
      planningSnapshot,
      generation,
      admissionEvidenceSource,
    );
  }
  recordPlanningProjectionIdentity(
    planningSnapshot,
    projection,
    generation,
    admissionEvidenceSource,
  ) {
    return planning.recordPlanningProjectionIdentity(
      this,
      planningSnapshot,
      projection,
      generation,
      admissionEvidenceSource,
    );
  }
  buildTrackedPriorityRecoveryPlanningProjection(planningSnapshot) {
    return planning.buildTrackedPriorityRecoveryPlanningProjection(this, planningSnapshot);
  }
  buildPriorityRecoveryPlanningProjectionUntracked(planningSnapshot) {
    return planning.buildPriorityRecoveryPlanningProjectionUntracked(this, planningSnapshot);
  }
  hasMembershipPublicationRecoveryGateEvidence(planningSnapshot) {
    return snapshot.hasMembershipPublicationRecoveryGateEvidence(this, planningSnapshot);
  }
  buildRetainedPriorityRecoveryPlanningGate(planningSnapshot, retainedSnapshot) {
    return snapshot.buildRetainedPriorityRecoveryPlanningGate(
      this,
      planningSnapshot,
      retainedSnapshot,
    );
  }
  normalizeMembershipPublicationPlanningSnapshot(planningSnapshot) {
    return snapshot.normalizeMembershipPublicationPlanningSnapshot(this, planningSnapshot);
  }
  isReadinessPlanningMemoWithinStaleGrace(observedAt, capturedAtMs) {
    return snapshot.isReadinessPlanningMemoWithinStaleGrace(this, observedAt, capturedAtMs);
  }
  readLatestMembershipPublicationEpochStatusProbe(nodeId) {
    return snapshot.readLatestMembershipPublicationEpochStatusProbe(this, nodeId);
  }
  buildMembershipPublicationPlanningMemoKeyComponent(nodeId) {
    return snapshot.buildMembershipPublicationPlanningMemoKeyComponent(this, nodeId);
  }
  readMembershipPublicationPlanningMemoVersionKey(nodeId, observedAt) {
    return snapshot.readMembershipPublicationPlanningMemoVersionKey(this, nodeId, observedAt);
  }
  readPlanningProjectionMemoIdentity(nodeId, _observedAt) {
    return snapshot.readPlanningProjectionMemoIdentity(this, nodeId, _observedAt);
  }
  membershipPublicationPlanningMemoVersionKeyMatches(
    cachedVersionKey,
    nodeId,
    sourceGeneration,
    planningIdentity,
  ) {
    return snapshot.membershipPublicationPlanningMemoVersionKeyMatches(
      this,
      cachedVersionKey,
      nodeId,
      sourceGeneration,
      planningIdentity,
    );
  }
  readPlanningProjectionSourceGeneration(observedAt) {
    return snapshot.readPlanningProjectionSourceGeneration(this, observedAt);
  }
  resolveMemoizedPriorityRecoveryPlanningProjectionSync(nodeId, observedAt) {
    return snapshot.resolveMemoizedPriorityRecoveryPlanningProjectionSync(this, nodeId, observedAt);
  }
  getPriorityRecoveryPlanningAnswerSync(nodeId, observedAt) {
    return snapshot.getPriorityRecoveryPlanningAnswerSync(this, nodeId, observedAt);
  }
  getMembershipPublicationPlanningSnapshotBestEffort(nodeId, observedAt) {
    return snapshot.getMembershipPublicationPlanningSnapshotBestEffort(this, nodeId, observedAt);
  }
  getPriorityRecoveryPlanningSnapshotBestEffort(nodeId, observedAt) {
    return snapshot.getPriorityRecoveryPlanningSnapshotBestEffort(this, nodeId, observedAt);
  }
  getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId, observedAt) {
    return snapshot.getPriorityRecoveryPlanningAnswerForOwnerRead(this, nodeId, observedAt);
  }
  getPriorityRecoveryPlanningAnswerForOwnerReadSync(nodeId, observedAt) {
    return snapshot.getPriorityRecoveryPlanningAnswerForOwnerReadSync(this, nodeId, observedAt);
  }
  getCurrentPublishedMembershipEpochSync(nodeId, observedAt) {
    return snapshot.getCurrentPublishedMembershipEpochSync(this, nodeId, observedAt);
  }
  buildMembershipPublicationDiagnostics(row, observedAt) {
    return snapshot.buildMembershipPublicationDiagnostics(this, row, observedAt);
  }
  buildMembershipPublicationPlanningSnapshot(context) {
    return snapshot.buildMembershipPublicationPlanningSnapshot(this, context);
  }
  resolveMembershipPublicationPlanningSnapshot(context) {
    return resolution.resolveMembershipPublicationPlanningSnapshot(this, context);
  }
  resolveMemoizedMembershipPublicationPlanningSnapshotSync(
    nodeId,
    observedAt,
    membershipPublication,
    membershipPublicationPlanningSnapshot,
  ) {
    return resolution.resolveMemoizedMembershipPublicationPlanningSnapshotSync(
      this,
      nodeId,
      observedAt,
      membershipPublication,
      membershipPublicationPlanningSnapshot,
    );
  }
  resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(context) {
    return resolution.resolveMemoizedMembershipPublicationPlanningSnapshotForContextSync(
      this,
      context,
    );
  }
  resolveMembershipPublicationPlanningSource(options) {
    return resolution.resolveServiceMembershipPublicationPlanningSource(this, options);
  }
  shouldPersistReadinessSnapshot(options) {
    return resolution.shouldPersistReadinessSnapshot(this, options);
  }
  buildDirectMembershipPublicationPlanningAnswer(nodeId, observedAt, membershipPublication) {
    return resolution.buildDirectMembershipPublicationPlanningAnswer(
      this,
      nodeId,
      observedAt,
      membershipPublication,
    );
  }
  resolveNodeMembershipPublicationPlanningAnswer(
    nodeId,
    observedAt,
    membershipPublication,
    options,
  ) {
    return resolution.resolveNodeMembershipPublicationPlanningAnswer(
      this,
      nodeId,
      observedAt,
      membershipPublication,
      options,
    );
  }
  resolveAvailableNodePlanningAnswer(nodeId, observedAt, membershipPublication) {
    return resolution.resolveAvailableNodePlanningAnswer(
      this,
      nodeId,
      observedAt,
      membershipPublication,
    );
  }
  markResolvedNodePlanningAnswer(nodeId, observedAt, membershipPublication, answer) {
    return resolution.markResolvedNodePlanningAnswer(
      this,
      nodeId,
      observedAt,
      membershipPublication,
      answer,
    );
  }
  resolveNodeMembershipPublicationPlanningAnswerSync(
    nodeId,
    observedAt,
    membershipPublication,
    options,
  ) {
    return resolution.resolveNodeMembershipPublicationPlanningAnswerSync(
      this,
      nodeId,
      observedAt,
      membershipPublication,
      options,
    );
  }
  buildMembershipPublicationReadOptions(readOptions) {
    return resolution.buildMembershipPublicationReadOptions(this, readOptions);
  }
  getLatestMembershipPublicationRowSync(nodeId, readOptions) {
    return resolution.getLatestMembershipPublicationRowSync(this, nodeId, readOptions);
  }
  getLatestMembershipPublicationRow(nodeId, readOptions) {
    return resolution.getLatestMembershipPublicationRow(this, nodeId, readOptions);
  }
  getLatestPublishedMembershipPublicationRowSync(readOptions) {
    return resolution.getLatestPublishedMembershipPublicationRowSync(this, readOptions);
  }
  getLatestPublishedMembershipPublicationRow(readOptions) {
    return startup.getLatestPublishedMembershipPublicationRow(this, readOptions);
  }
  buildStartupAuthorityFailureDescriptor(failureReason) {
    return startup.buildStartupAuthorityFailureDescriptor(this, failureReason);
  }
  buildStartupAuthorityPublicationDescriptor(details) {
    return startup.buildStartupAuthorityPublicationDescriptor(this, details);
  }
  buildStartupAuthorityPriorityPartitionDescriptor(priorityPartitionSummary) {
    return startup.buildStartupAuthorityPriorityPartitionDescriptor(this, priorityPartitionSummary);
  }
  buildStartupAuthorityRecoveryProtocolDescriptor(recoveryProtocolState) {
    return startup.buildStartupAuthorityRecoveryProtocolDescriptor(this, recoveryProtocolState);
  }
  buildStartupAuthorityTargetParticipationDescriptor(targetParticipation) {
    return startup.buildStartupAuthorityTargetParticipationDescriptor(this, targetParticipation);
  }
  buildStartupAuthoritySnapshotContract(options) {
    return startup.buildStartupAuthoritySnapshotContract(this, options);
  }
  buildPriorityRecoveryHealthDetailsFromStartupAuthority(startupAuthority, reasonCodes) {
    return startup.buildPriorityRecoveryHealthDetailsFromStartupAuthority(
      this,
      startupAuthority,
      reasonCodes,
    );
  }
  buildStartupAuthorityUnavailableSnapshot(failureReason, error, context) {
    return startup.buildStartupAuthorityUnavailableSnapshot(this, failureReason, error, context);
  }
  buildStartupAuthoritySnapshotFromPlanningAnswer(planningSnapshot) {
    return startup.buildStartupAuthoritySnapshotFromPlanningAnswer(this, planningSnapshot);
  }
  getStartupAuthoritySnapshotSync(nodeId, observedAt) {
    return startup.getStartupAuthoritySnapshotSync(this, nodeId, observedAt);
  }
  getFormationReleaseStartupAuthoritySnapshotSync(nodeId, observedAt) {
    return startup.getFormationReleaseStartupAuthoritySnapshotSync(this, nodeId, observedAt);
  }
  resolveStartupAuthoritySnapshotFromPlanningRead(readPlanningAnswer, nodeId, observedAt) {
    return startup.resolveStartupAuthoritySnapshotFromPlanningRead(
      this,
      readPlanningAnswer,
      nodeId,
      observedAt,
    );
  }
  getFormationReleaseStartupAuthoritySnapshot(nodeId, observedAt) {
    return startup.getFormationReleaseStartupAuthoritySnapshot(this, nodeId, observedAt);
  }
  getStartupAuthoritySnapshot(nodeId, observedAt) {
    return startup.getStartupAuthoritySnapshot(this, nodeId, observedAt);
  }
  buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(planningSnapshot) {
    return startup.buildPriorityControlPlaneRecoveryHealthFromPlanningAnswer(
      this,
      planningSnapshot,
    );
  }
  getPriorityControlPlaneRecoveryHealthSync(nodeId, observedAt) {
    return startup.getPriorityControlPlaneRecoveryHealthSync(this, nodeId, observedAt);
  }
  getPriorityControlPlaneRecoveryHealth(nodeId, observedAt) {
    return startup.getPriorityControlPlaneRecoveryHealth(this, nodeId, observedAt);
  }
  getCapacitySnapshotSync(nodeId, _nodeRow) {
    return startup.getCapacitySnapshotSync(this, nodeId, _nodeRow);
  }
  buildPriorityControlPlaneRecoveryProjection(context) {
    return startup.buildPriorityControlPlaneRecoveryProjection(this, context);
  }
  shouldPreferLocalSelfNodeEvidence(context) {
    return startup.shouldPreferLocalSelfNodeEvidence(this, context);
  }
  readNodeRow(nodeId, options) {
    return startup.readNodeRow(this, nodeId, options);
  }
  readNodeRows(options) {
    return rows.readNodeRows(this, options);
  }
  readNodeServiceRows(nodeId, options) {
    return rows.readNodeServiceRows(this, nodeId, options);
  }
  readAuthoritativeServiceRows(options) {
    return rows.readAuthoritativeServiceRows(this, options);
  }
  readAllNodeServiceRows(options) {
    return rows.readAllNodeServiceRows(this, options);
  }
  getNodeRow(nodeId) {
    return rows.getNodeRow(this, nodeId);
  }
  getNodeRows() {
    return rows.getNodeRows(this);
  }
  getNodeServiceRows(nodeId) {
    return rows.getNodeServiceRows(this, nodeId);
  }
  getLifecycleState(nodeId, nodeRow) {
    return rows.getLifecycleState(this, nodeId, nodeRow);
  }
  getCapacitySnapshot(nodeId, _nodeRow) {
    return rows.getCapacitySnapshot(this, nodeId, _nodeRow);
  }
  hasRoutableService(serviceRows) {
    return rows.hasRoutableService(this, serviceRows);
  }
  hasWritableControlPlaneService(serviceRows) {
    return rows.hasWritableControlPlaneService(this, serviceRows);
  }
  hasServeEligibleControlPlaneService(serviceRows) {
    return rows.hasServeEligibleControlPlaneService(this, serviceRows);
  }
  hasActiveAddressedMessageGroupService(serviceRows) {
    return rows.hasActiveAddressedMessageGroupService(this, serviceRows);
  }
  hasRecoveryGraceControlPlaneService(serviceRows) {
    return rows.hasRecoveryGraceControlPlaneService(this, serviceRows);
  }
  hasStartupControlPlaneWriteGrace(serviceRows) {
    return rows.hasStartupControlPlaneWriteGrace(this, serviceRows);
  }
  hasAddressedService(serviceRow) {
    return rows.hasAddressedService(this, serviceRow);
  }
  hasAddressedMessageGroupServiceWithStatuses(serviceRows, allowedStatuses) {
    return rows.hasAddressedMessageGroupServiceWithStatuses(this, serviceRows, allowedStatuses);
  }
  hasActiveAddressedNonMessageGroupService(serviceRows) {
    return rows.hasActiveAddressedNonMessageGroupService(this, serviceRows);
  }
  isLoadReady(nodeRow) {
    return rows.isLoadReady(this, nodeRow);
  }
  isCapacityPlacementEligible(capacity) {
    return rows.isCapacityPlacementEligible(this, capacity);
  }
  getCapacityReasonCode(capacity) {
    return rows.getCapacityReasonCode(this, capacity);
  }
  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    return rows.buildClusterMemberHealthDetails(this, nodeId, nodeRow);
  }
  getLocalQueryTransportEvidence(nodeId) {
    return rows.getLocalQueryTransportEvidence(this, nodeId);
  }
  getNodeTransportState(nodeId, nodeRow) {
    return rows.getNodeTransportState(this, nodeId, nodeRow);
  }
  isNodeTransportConnected(nodeId, nodeRow) {
    return rows.isNodeTransportConnected(this, nodeId, nodeRow);
  }
  isRecentHeartbeat(nodeRow) {
    return rows.isRecentHeartbeat(this, nodeRow);
  }
  isClusterMemberHealthy(nodeId, nodeRow) {
    return rows.isClusterMemberHealthy(this, nodeId, nodeRow);
  }
  static compactSnapshotSummary(snapshot, decisionDimension) {
    return rows.compactSnapshotSummary(snapshot, decisionDimension);
  }
}

// Inherited mixin fragments, installed in the precedence order the former
// chain gave them; none shares a name with a class method above.
installControlPlaneReadinessPlanningOwnerDelegateMethods(
  ControlPlaneReadinessService.prototype,
);
installControlPlaneReadinessNodeMethods(ControlPlaneReadinessService.prototype);
installControlPlaneReadinessNodeLivenessMethods(
  ControlPlaneReadinessService.prototype,
);
installControlPlaneReadinessSnapshotStoreMethods(
  ControlPlaneReadinessService.prototype,
);
installControlPlaneReadinessRuntimeAuthorityMethods(
  ControlPlaneReadinessService.prototype,
);
installControlPlaneReadinessFormationReleaseMethods(
  ControlPlaneReadinessService.prototype,
);

export {ControlPlaneReadinessService, MEMBERSHIP_PUBLICATION_PLANNING_SOURCE};
