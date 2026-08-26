import {STARTUP_AUTHORITY_STATE} from './startup-authority-snapshot-owner.js';
import {NODE_STATE, STATE} from '../constants/index.js';
import {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
  attachFormationReleaseHandoffToStartupAuthority,
  buildAuthorityEvidence,
  buildConnectionEvidenceById,
  buildContract,
  buildNodeEvidenceById,
  freezeCohort,
  formationReleaseCohortContainsNodeId,
  isExactFormationReleaseSpreadReopen,
  isConnectedFormationMember,
  isCurrentReadyMember,
  isRetainableAuthority,
  normalizeFormationReleaseHandoffContract,
  normalizePublishedRecoveryContract,
  authorizeFormationReleaseHandoffPublicationIntent,
} from './formation-release-handoff-contract.js';
import {formationReleaseObservedNodeBootMatchesExpected} from
  './formation-release-handoff-state-grammar.js';
import {isStartupAuthorityProjectionSynchronization} from
  './startup-authority-snapshot-owner.js';
import {
  formationReleaseCohortIdentity,
  formationReleaseContractsEqual,
  formationReleaseGenerationIdentity,
} from './formation-release-handoff-identity.js';
import {FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE} from
  './formation-release-handoff-policy.js';

const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;
const DEFAULT_AUTHORITY_NODE_ID = 'formation-global';

function createFormationReleaseNodeIdList() {
  return [];
}

function compatibleProjectionTransitionMatchesGeneration(
  authority,
  generation,
) {
  return authority.publicationEpoch >= generation.publicationEpoch &&
    authority.fenceIdentity === generation.fenceIdentity &&
    isStartupAuthorityProjectionSynchronization(authority);
}

function generationIsAtOrBelowTerminal(generation, terminalGeneration) {
  if (!generation || !terminalGeneration) return false;
  return generation.authorityNodeId === terminalGeneration.authorityNodeId &&
    generation.authorityBootIncarnation ===
      terminalGeneration.authorityBootIncarnation &&
    generation.publicationEpoch <= terminalGeneration.publicationEpoch;
}

function normalizedContractRecordsExactReopen(contract) {
  if (
    contract.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE ||
    contract.releaseAuthorized !== true
  ) {
    return false;
  }
  return isExactFormationReleaseSpreadReopen({
    ready: contract.observedAuthorityReady,
    state: STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
    prioritySpreadSatisfied: false,
    recoveryReasonCodes: contract.observedRecoveryReasonCodes,
  });
}

function durableAuthorityMatchesCurrentConnection(
  contract,
  authorityNodeId,
  connectionEvidence,
) {
  if (contract.authorityNodeId !== authorityNodeId) return false;
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (!connectionsById) return false;
  const authorityConnection = mapPrototypeGet(
    connectionsById,
    authorityNodeId,
  );
  return authorityConnection?.bootIncarnation ===
    contract.authorityBootIncarnation;
}

function generationFromRecoveryContract(contract) {
  return objectFreeze({
    id: contract.generation,
    authorityNodeId: contract.authorityNodeId,
    authorityBootIncarnation: contract.authorityBootIncarnation,
    publicationEpoch: contract.capturedPublicationEpoch,
    fenceIdentity: contract.fenceIdentity,
    canonicalNodeIds: contract.canonicalNodeIds,
    cohortSignature: formationReleaseCohortIdentity(contract.requiredCohort),
    requiredCohort: contract.requiredCohort,
  });
}

function recoverCompatibleAuthorityFromDurableActiveContract(contract) {
  const exactReady = contract.observedAuthorityReady === true &&
    contract.observedRecoveryReasonCodes.length === 0;
  const exactReopen = normalizedContractRecordsExactReopen(contract);
  if (!exactReady && !exactReopen) return null;
  return objectFreeze({
    ready: exactReady,
    state: exactReady ? STARTUP_AUTHORITY_STATE.READY :
      STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
    publicationEpoch: contract.observedPublicationEpoch,
    canonicalNodeIds: contract.canonicalNodeIds,
    recoveryReasonCodes: contract.observedRecoveryReasonCodes,
    prioritySpreadSatisfied: exactReady,
    fenceIdentity: contract.fenceIdentity,
  });
}

function buildNonAuthorizingActiveProjection(contract, generation) {
  return buildContract({
    state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
    reason: FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY,
    generation,
    readyNodeIds: contract.readyNodeIds,
    pendingNodeIds: contract.pendingNodeIds,
    observedPublicationEpoch: contract.observedPublicationEpoch,
    observedAuthorityReady: contract.observedAuthorityReady,
    observedRecoveryReasonCodes: contract.observedRecoveryReasonCodes,
    releaseAuthorized: false,
  });
}

function buildTerminalPendingProjection(generation, terminalIntent) {
  return buildContract({
    state: FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING,
    reason: FORMATION_RELEASE_HANDOFF_REASON.TERMINAL_DURABILITY_PENDING,
    generation,
    readyNodeIds: terminalIntent.readyNodeIds,
    pendingNodeIds: terminalIntent.pendingNodeIds,
    observedPublicationEpoch: terminalIntent.observedPublicationEpoch,
    observedAuthorityReady: terminalIntent.observedAuthorityReady,
    observedRecoveryReasonCodes:
      terminalIntent.observedRecoveryReasonCodes,
    releaseAuthorized: false,
    pendingTerminalState: terminalIntent.state,
    pendingTerminalReason: terminalIntent.reason,
  });
}

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
  if (!formationReleaseObservedNodeBootMatchesExpected(
    connection.bootIncarnation,
    node.bootIncarnation,
  )) {
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
  return cohort.length >= FORMATION_RELEASE_HANDOFF_MINIMUM_COHORT_SIZE ?
    cohort : null;
}

function capturedMemberProblem(member, node, connection) {
  if (!node) return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_MISSING;
  if (!connection || connection.bootIncarnation !== member.bootIncarnation) {
    return FORMATION_RELEASE_HANDOFF_REASON.COHORT_MEMBER_INELIGIBLE;
  }
  if (!formationReleaseObservedNodeBootMatchesExpected(
    member.bootIncarnation,
    node.bootIncarnation,
  )) {
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
  const authority = buildAuthorityEvidence(startupAuthority);
  const rowsById = buildNodeEvidenceById(nodeRows);
  const connectionsById = buildConnectionEvidenceById(connectionEvidence);
  if (!authority || !rowsById || !connectionsById) return null;
  if (!numberIsFinite(observedAt)) return null;
  if (typeof authorityNodeId !== 'string') return null;
  if (authorityNodeId.length === 0) return null;
  return {authority, rowsById, connectionsById};
}

class FormationReleaseHandoffClosureOwner {
  constructor() {
    this.generation = null;
    this.publishedGeneration = null;
    this.durableActiveContract = null;
    this.durableReopenAcknowledged = false;
    this.pendingTerminalIntent = null;
    this.recoveryAwaitingEvidence = false;
    this.lastCompatibleAuthority = null;
    this.terminalGeneration = null;
    this.reopenObserved = false;
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
    const normalized = normalizePublishedRecoveryContract(contract);
    if (!normalized || !durableAuthorityMatchesCurrentConnection(
      normalized,
      authorityNodeId,
      connectionEvidence,
    )) {
      return this.lastContract;
    }
    const restoredGeneration = generationFromRecoveryContract(normalized);
    if (generationIsAtOrBelowTerminal(
      restoredGeneration,
      this.terminalGeneration,
    )) {
      return this.lastContract;
    }
    if (normalized.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) {
      return this.commitTerminalContract(normalized, restoredGeneration);
    }
    this.generation = restoredGeneration;
    this.publishedGeneration = normalized.generation;
    this.durableActiveContract = normalized;
    this.durableReopenAcknowledged =
      normalizedContractRecordsExactReopen(normalized);
    this.pendingTerminalIntent = null;
    this.recoveryAwaitingEvidence = true;
    this.lastCompatibleAuthority =
      recoverCompatibleAuthorityFromDurableActiveContract(normalized);
    this.reopenObserved = normalizedContractRecordsExactReopen(normalized);
    this.lastContract = buildNonAuthorizingActiveProjection(
      normalized,
      restoredGeneration,
    );
    return this.observe(
      startupAuthority,
      nodeRows,
      observedAt,
      authorityNodeId,
      connectionEvidence,
    );
  }

  commitTerminalContract(contract, generation = this.generation) {
    this.generation = null;
    this.publishedGeneration = null;
    this.durableActiveContract = null;
    this.durableReopenAcknowledged = false;
    this.pendingTerminalIntent = null;
    this.recoveryAwaitingEvidence = false;
    this.lastCompatibleAuthority = null;
    this.terminalGeneration = generation || this.terminalGeneration;
    this.reopenObserved = false;
    this.lastContract = contract;
    return this.lastContract;
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
    if (generationIsAtOrBelowTerminal({
      authorityNodeId,
      authorityBootIncarnation: authorityConnection.bootIncarnation,
      publicationEpoch: authority.publicationEpoch,
    }, this.terminalGeneration)) {
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
    if (!generation) return this.lastContract;
    const terminalIntent = buildContract({
      state: FORMATION_RELEASE_HANDOFF_STATE.REVOKED,
      reason,
      generation,
      observedPublicationEpoch:
        observedPublicationEpoch ?? generation?.publicationEpoch ?? null,
    });
    this.pendingTerminalIntent = terminalIntent;
    this.recoveryAwaitingEvidence = false;
    this.lastContract = buildTerminalPendingProjection(
      generation,
      terminalIntent,
    );
    return this.lastContract;
  }

  evaluateCapturedCohort(
    authority,
    rowsById,
    connectionsById,
    observedAt,
  ) {
    const generation = this.generation;
    const firstReopenObservation =
      isExactFormationReleaseSpreadReopen(authority) &&
      this.reopenObserved === false;
    if (isExactFormationReleaseSpreadReopen(authority)) {
      this.reopenObserved = true;
    }
    const readyNodeIds = createFormationReleaseNodeIdList();
    const pendingNodeIds = createFormationReleaseNodeIdList();
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

    if (
      pendingNodeIds.length === 0 &&
      this.reopenObserved === true &&
      this.durableReopenAcknowledged === true &&
      !firstReopenObservation
    ) {
      const terminalIntent = buildContract({
        state: FORMATION_RELEASE_HANDOFF_STATE.COMPLETE,
        reason: FORMATION_RELEASE_HANDOFF_REASON.CAPTURED_COHORT_READY,
        generation,
        readyNodeIds,
        observedPublicationEpoch: authority.publicationEpoch,
        observedAuthorityReady: authority.ready,
        observedRecoveryReasonCodes: authority.recoveryReasonCodes,
      });
      this.pendingTerminalIntent = terminalIntent;
      this.recoveryAwaitingEvidence = false;
      this.lastContract = buildTerminalPendingProjection(
        generation,
        terminalIntent,
      );
      return this.lastContract;
    }

    const durableReopenContract = this.durableReopenAcknowledged ?
      this.durableActiveContract : null;
    this.lastContract = buildContract({
      state: FORMATION_RELEASE_HANDOFF_STATE.ACTIVE,
      reason: FORMATION_RELEASE_HANDOFF_REASON.RETAINED_UNTIL_READY,
      generation,
      readyNodeIds,
      pendingNodeIds,
      observedPublicationEpoch: authority.publicationEpoch,
      observedAuthorityReady: durableReopenContract ?
        durableReopenContract.observedAuthorityReady : authority.ready,
      observedRecoveryReasonCodes: durableReopenContract ?
        durableReopenContract.observedRecoveryReasonCodes :
        authority.recoveryReasonCodes,
      releaseAuthorized: this.publishedGeneration === generation.id,
    });
    return this.lastContract;
  }

  observe(
    startupAuthority,
    nodeRows,
    observedAt,
    authorityNodeId = DEFAULT_AUTHORITY_NODE_ID,
    connectionEvidence = [],
  ) {
    if (this.pendingTerminalIntent) return this.lastContract;
    const observation = buildObservation(
      startupAuthority,
      nodeRows,
      observedAt,
      authorityNodeId,
      connectionEvidence,
    );
    if (!observation) {
      if (this.recoveryAwaitingEvidence) return this.lastContract;
      if (this.generation) {
        return this.revoke(
          FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
        );
      }
      return this.lastContract;
    }
    const {authority, rowsById, connectionsById} = observation;
    this.recoveryAwaitingEvidence = false;

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
      this.durableActiveContract = null;
      this.durableReopenAcknowledged = false;
      this.pendingTerminalIntent = null;
      this.reopenObserved = false;
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

    if (compatibleProjectionTransitionMatchesGeneration(
      authority,
      this.generation,
    )) {
      if (!this.lastCompatibleAuthority) {
        return this.revoke(
          FORMATION_RELEASE_HANDOFF_REASON.AUTHORITY_INCOMPATIBLE,
          authority.publicationEpoch,
        );
      }
      return this.evaluateCapturedCohort(
        this.lastCompatibleAuthority,
        rowsById,
        connectionsById,
        observedAt,
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
    if (this.pendingTerminalIntent) return this.lastContract;
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
    if (!formationReleaseCohortContainsNodeId(
      this.generation,
      authorityNodeId,
    )) {
      return null;
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

  acknowledgePublication(durableContract) {
    const normalizedDurableContract =
      normalizeFormationReleaseHandoffContract(durableContract);
    if (this.pendingTerminalIntent) {
      if (!formationReleaseContractsEqual(
        normalizedDurableContract,
        this.pendingTerminalIntent,
      )) {
        return this.lastContract;
      }
      return this.commitTerminalContract(
        normalizedDurableContract,
        this.generation,
      );
    }
    const expectedDurableContract =
      authorizeFormationReleaseHandoffPublicationIntent(this.lastContract);
    if (
      !this.generation ||
      this.lastContract.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE ||
      !formationReleaseContractsEqual(
        normalizedDurableContract,
        expectedDurableContract,
      )
    ) {
      return this.lastContract;
    }
    this.publishedGeneration = normalizedDurableContract.generation;
    this.durableActiveContract = normalizedDurableContract;
    this.durableReopenAcknowledged = this.durableReopenAcknowledged ||
      normalizedContractRecordsExactReopen(normalizedDurableContract);
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

  publicationIntent() {
    return this.pendingTerminalIntent || this.lastContract;
  }
}

export {
  FORMATION_RELEASE_HANDOFF_REASON,
  FORMATION_RELEASE_HANDOFF_STATE,
  FormationReleaseHandoffClosureOwner,
  attachFormationReleaseHandoffToStartupAuthority,
};
