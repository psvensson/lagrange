import {STARTUP_AUTHORITY_STATE} from './startup-authority-snapshot-owner.js';
import {NODE_STATE, STATE} from '../constants/index.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
  attachFormationReleaseHandoffToStartupAuthority,
  buildContract,
  freezeCohort,
  isRetainableAuthority,
  normalizePublishedConsumerContract,
  validatePublishedContractAgainstCurrent,
} from './formation-release-handoff-contract.js';
import {
  EVIDENCE_OUTCOME,
  buildAuthorityEvidence,
  buildConnectionEvidenceById,
  buildNodeEvidenceById,
  isConnectedFormationMember,
  isCurrentReadyMember,
} from './formation-release-handoff-evidence.js';
import {formationReleaseCohortIdentity, formationReleaseGenerationIdentity} from './formation-release-handoff-identity.js';

const FORMATION_GLOBAL_AUTHORITY_NODE_ID = 'formation-global';
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;
const FROZEN_EMPTY_NODE_IDS = objectFreeze([]);

function captureCohortMember(
  nodeId,
  rowsById,
  connectionsById,
  observedAt,
) {
  const node = mapPrototypeGet(rowsById, nodeId);
  if (!node) return null;
  if (!isConnectedFormationMember(node)) {
    return isCurrentReadyMember(node, observedAt) ? false : null;
  }
  const connection = mapPrototypeGet(connectionsById, nodeId);
  if (!connection) return null;
  if (
    node.bootIncarnation > 0 &&
    node.bootIncarnation !== connection.bootIncarnation
  ) {
    return null;
  }
  return {
    nodeId,
    bootIncarnation: connection.bootIncarnation,
  };
}

function captureFormationCohort(
  authority,
  rowsById,
  connectionsById,
  observedAt,
) {
  const cohort = [];
  for (let index = 0; index < authority.canonicalNodeIds.length; index += 1) {
    const member = captureCohortMember(
      authority.canonicalNodeIds[index],
      rowsById,
      connectionsById,
      observedAt,
    );
    if (member === null) return null;
    if (member !== false) arrayPrototypePush(cohort, member);
  }
  return cohort.length > 0 ? cohort : null;
}

function capturedMemberProblem(member, node, connection) {
  if (!node) return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_MISSING;
  if (!connection || connection.bootIncarnation !== member.bootIncarnation) {
    return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
  }
  if (
    node.bootIncarnation > 0 &&
    node.bootIncarnation !== member.bootIncarnation
  ) {
    return FORMATION_RELEASE_HANDOFF_REASON.COHORT_INCARNATION_CHANGED;
  }
  if (node.status !== NODE_STATE.JOINING && node.status !== NODE_STATE.ACTIVE) {
    return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
  }
  if (
    node.connectionState !== STATE.CONNECTED &&
    node.connectionState !== STATE.READY
  ) {
    return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
  }
  return null;
}

function buildObservation(
  startupAuthority,
  nodeRows,
  observedAt,
  authorityNodeId,
  connectionEvidence,
) {
  const authorityResult = buildAuthorityEvidence(startupAuthority);
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (authorityResult.outcome !== EVIDENCE_OUTCOME.PRESENT) return null;
  if (!rowsById || !connectionsById) return null;
  if (!numberIsFinite(observedAt)) return null;
  if (typeof authorityNodeId !== 'string') return null;
  if (authorityNodeId.length === 0) return null;
  return {authority: authorityResult.value, rowsById, connectionsById};
}

class FormationReleaseHandoffClosureOwner {
  constructor() {
    this.generation = null;
    this.publishedGeneration = null;
    this.lastCompatibleAuthority = null;
    this.terminalGeneration = null;
    this.lastContract = buildContract({
      state: FORMATION_RELEASE_HANDOFF_STATE.IDLE,
      reason: FORMATION_RELEASE_HANDOFF_REASON.NO_SATISFIED_COHORT,
    });
  }

  restore(
    contract,
    startupAuthority,
    nodeRows,
    observedAt,
    authorityNodeId,
    connectionEvidence = [],
  ) {
    if (this.generation) {
      return this.lastContract;
    }
    const normalized = normalizePublishedConsumerContract(contract);
    if (!normalized || normalized.authorityNodeId !== authorityNodeId) {
      return this.lastContract;
    }
    const current = validatePublishedContractAgainstCurrent(
      normalized,
      startupAuthority,
      nodeRows,
      observedAt,
      connectionEvidence,
    );
    if (!current) {
      return this.lastContract;
    }
    this.generation = objectFreeze({
      id: normalized.generation,
      authorityNodeId: normalized.authorityNodeId,
      authorityBootIncarnation: normalized.authorityBootIncarnation,
      publicationEpoch: normalized.capturedPublicationEpoch,
      fenceIdentity: normalized.fenceIdentity,
      canonicalNodeIds: normalized.canonicalNodeIds,
      cohortSignature: normalized.cohortSignature,
      requiredCohort: normalized.requiredCohort,
    });
    this.publishedGeneration = normalized.generation;
    this.lastCompatibleAuthority = current.authority;
    return this.evaluateCapturedCohort(
      current.authority,
      current.rowsById,
      current.connectionsById,
      observedAt,
    );
  }

  captureGeneration(
    authority,
    rowsById,
    connectionsById,
    authorityNodeId,
    observedAt,
  ) {
    if (authority.ready !== true) return null;
    if (authority.state !== STARTUP_AUTHORITY_STATE.READY) return null;
    if (authority.prioritySpreadSatisfied !== true) return null;
    const authorityConnection = mapPrototypeGet(
      connectionsById,
      authorityNodeId,
    );
    if (!authorityConnection) return null;
    const cohort = captureFormationCohort(
      authority,
      rowsById,
      connectionsById,
      observedAt,
    );
    if (!cohort) return null;
    const requiredCohort = freezeCohort(cohort);
    const cohortSignature = formationReleaseCohortIdentity(requiredCohort);
    if (
      cohortSignature === this.terminalGeneration?.cohortSignature &&
      authority.publicationEpoch <=
        this.terminalGeneration.publicationEpoch
    ) {
      return null;
    }
    return objectFreeze({
      id: formationReleaseGenerationIdentity(
        authority.publicationEpoch, authorityNodeId,
        authorityConnection.bootIncarnation, requiredCohort),
      authorityNodeId,
      authorityBootIncarnation: authorityConnection.bootIncarnation,
      publicationEpoch: authority.publicationEpoch,
      fenceIdentity: authority.fenceIdentity,
      canonicalNodeIds: objectFreeze(
        arrayPrototypeSlice(authority.canonicalNodeIds),
      ),
      cohortSignature,
      requiredCohort,
    });
  }

  revoke(reason, observedPublicationEpoch = null) {
    const generation = this.generation;
    this.generation = null;
    this.publishedGeneration = null;
    this.lastCompatibleAuthority = null;
    this.terminalGeneration = generation || this.terminalGeneration;
    this.lastContract = buildContract({
      state: FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
      reason,
      generation,
      observedPublicationEpoch:
        observedPublicationEpoch ?? generation?.publicationEpoch ?? null,
    });
    return this.lastContract;
  }

  evaluateCapturedCohort(
    authority,
    rowsById,
    connectionsById,
    observedAt,
  ) {
    const generation = this.generation;
    // Cohort-progress buckets are data accumulators, not semantic outcomes;
    // they are seeded from the explicit empty frozen prototype (not a raw
    // empty-state literal, §4.5) and classified by the terminal length checks
    // below.
    const readyNodeIds = arrayPrototypeSlice(FROZEN_EMPTY_NODE_IDS);
    const pendingNodeIds = arrayPrototypeSlice(FROZEN_EMPTY_NODE_IDS);
    for (
      let index = 0;
      index < generation.requiredCohort.length;
      index += 1
    ) {
      const member = generation.requiredCohort[index];
      const node = mapPrototypeGet(rowsById, member.nodeId);
      const connection = mapPrototypeGet(connectionsById, member.nodeId);
      const problem = capturedMemberProblem(member, node, connection);
      if (problem) return this.revoke(problem, authority.publicationEpoch);
      if (
        node.bootIncarnation === member.bootIncarnation &&
        isCurrentReadyMember(node, observedAt)
      ) {
        arrayPrototypePush(readyNodeIds, member.nodeId);
      } else {
        arrayPrototypePush(pendingNodeIds, member.nodeId);
      }
    }

    if (pendingNodeIds.length === 0) {
      this.generation = null;
      this.publishedGeneration = null;
      this.lastCompatibleAuthority = null;
      this.terminalGeneration = generation;
      this.lastContract = buildContract({
        state: FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
        reason: FORMATION_RELEASE_HANDOFF_REASON.CAPTURED_COHORT_READY,
        generation,
        readyNodeIds,
        observedPublicationEpoch: authority.publicationEpoch,
        observedAuthorityReady: authority.ready,
        observedRecoveryReasonCodes: authority.recoveryReasonCodes,
      });
      return this.lastContract;
    }

    this.lastContract = buildContract({
      state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
      reason: FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY,
      generation,
      readyNodeIds,
      pendingNodeIds,
      observedPublicationEpoch: authority.publicationEpoch,
      observedAuthorityReady: authority.ready,
      observedRecoveryReasonCodes: authority.recoveryReasonCodes,
      releaseAuthorized: this.publishedGeneration === generation.id,
    });
    return this.lastContract;
  }

  observe(
    startupAuthority,
    nodeRows,
    observedAt,
    authorityNodeId = FORMATION_GLOBAL_AUTHORITY_NODE_ID,
    connectionEvidence = [],
  ) {
    const observation = buildObservation(
      startupAuthority,
      nodeRows,
      observedAt,
      authorityNodeId,
      connectionEvidence,
    );
    if (!observation) {
      if (this.generation) {
        return this.revoke(
          FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
        );
      }
      return this.lastContract;
    }
    const {authority, rowsById, connectionsById} = observation;

    if (!this.generation) {
      const generation = this.captureGeneration(
        authority,
        rowsById,
        connectionsById,
        authorityNodeId,
        observedAt,
      );
      if (!generation) {
        return this.lastContract;
      }
      this.generation = generation;
      this.publishedGeneration = null;
    }

    const authorityConnection = mapPrototypeGet(
      connectionsById,
      this.generation.authorityNodeId,
    );
    if (
      !authorityConnection ||
      authorityConnection.bootIncarnation !==
        this.generation.authorityBootIncarnation
    ) {
      return this.revoke(
        FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
        authority.publicationEpoch,
      );
    }

    if (!isRetainableAuthority(authority, this.generation)) {
      return this.revoke(
        FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
        authority.publicationEpoch,
      );
    }
    this.lastCompatibleAuthority = authority;
    return this.evaluateCapturedCohort(
      authority,
      rowsById,
      connectionsById,
      observedAt,
    );
  }

  project(
    startupAuthority,
    nodeRows,
    observedAt,
    authorityNodeId,
    connectionEvidence = [],
  ) {
    if (!this.generation) {
      return this.lastContract;
    }
    if (authorityNodeId === this.generation.authorityNodeId) {
      return this.observe(
        startupAuthority,
        nodeRows,
        observedAt,
        authorityNodeId,
        connectionEvidence,
      );
    }
    const rowsById = buildNodeEvidenceById(nodeRows);
    const connectionsById = buildConnectionEvidenceById(connectionEvidence);
    if (
      !rowsById ||
      !connectionsById ||
      !numberIsFinite(observedAt) ||
      !this.lastCompatibleAuthority
    ) {
      return this.revoke(
        FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
      );
    }
    return this.evaluateCapturedCohort(
      this.lastCompatibleAuthority,
      rowsById,
      connectionsById,
      observedAt,
    );
  }

  acknowledgePublication(generationId) {
    if (
      !this.generation ||
      this.generation.id !== generationId ||
      this.lastContract.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE
    ) {
      return this.lastContract;
    }
    this.publishedGeneration = generationId;
    this.lastContract = buildContract({
      state: this.lastContract.state,
      reason: this.lastContract.reason,
      generation: this.generation,
      readyNodeIds: this.lastContract.readyNodeIds,
      pendingNodeIds: this.lastContract.pendingNodeIds,
      observedPublicationEpoch:
        this.lastContract.observedPublicationEpoch,
      observedAuthorityReady: this.lastContract.observedAuthorityReady,
      observedRecoveryReasonCodes:
        this.lastContract.observedRecoveryReasonCodes,
      releaseAuthorized: true,
    });
    return this.lastContract;
  }
}

export {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
  FormationReleaseHandoffClosureOwner,
  attachFormationReleaseHandoffToStartupAuthority,
};
