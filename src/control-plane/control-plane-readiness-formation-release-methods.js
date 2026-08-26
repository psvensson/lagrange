import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from
  './control-plane-readiness-planning-shared.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  attachFormationReleaseHandoffToStartupAuthority,
  buildAuthorityEvidence,
  formationReleaseHandoffAuthorizesNode,
  validateFormationReleaseHandoffConsumerContract,
} from './formation-release-handoff-contract.js';
import {formationReleaseContractsEqual} from
  './formation-release-handoff-identity.js';
import {
  validateFormationReleaseHandoffSeedProjection,
} from './formation-release-handoff-consumer.js';
import {
  buildFormationReleasePhysicalEvidence,
} from './formation-release-handoff-diagnostics.js';
import {
  formationReleaseHandoffPublicationId,
  readFormationReleaseHandoffPublicationFromCache,
  readFormationReleaseHandoffPublicationRow,
} from './formation-release-handoff-publication.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeJoin = Function.call.bind(Array.prototype.join);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const numberIsSafeInteger = Number.isSafeInteger;
const objectDefineProperties = Object.defineProperties;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;

const {COLUMN} = SHARED;
const FORMATION_RELEASE_BOOT_INCARNATION_ABSENT = null;
const FORMATION_RELEASE_PUBLICATION_ABSENT = null;
const OWN_DATA_VALUE_FIELD = 'value';
const SIGNATURE_LIST_SEPARATOR = ',';
const SIGNATURE_PART_SEPARATOR = '|';
const HANDOFF_FIELD = Object.freeze({
  GENERATION: 'generation',
  OBSERVED_AUTHORITY_READY: 'observedAuthorityReady',
  OBSERVED_PUBLICATION_EPOCH: 'observedPublicationEpoch',
  PENDING_NODE_IDS: 'pendingNodeIds',
  PENDING_TERMINAL_REASON: 'pendingTerminalReason',
  PENDING_TERMINAL_STATE: 'pendingTerminalState',
  REASON: 'reason',
  RELEASE_AUTHORIZED: 'releaseAuthorized',
  STATE: 'state',
  FENCE_IDENTITY: 'fenceIdentity',
});
const AUTHORITY_CANONICAL_NODE_IDS_FIELD = 'canonicalStartupNodeIds';
const AUTHORITY_PRIORITY_SUMMARY_FIELD = 'priorityPartitionSummary';
const AUTHORITY_PRIORITY_SUMMARY_SATISFIED_FIELD = 'satisfied';
const AUTHORITY_REASON_CODES_FIELD = 'priorityRecoveryReasonCodes';
const AUTHORITY_READY_FIELD = 'ready';
const AUTHORITY_STATE_FIELD = 'state';
const NORMALIZED_AUTHORITY_PUBLICATION_EPOCH_FIELD = 'publicationEpoch';
const NORMALIZED_AUTHORITY_FENCE_IDENTITY_FIELD = 'fenceIdentity';

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

function formationReleaseLogSignature(
  handoff,
  startupAuthority,
  normalizedAuthority,
) {
  return arrayPrototypeJoin([
    readOwnData(handoff, HANDOFF_FIELD.STATE) || '',
    readOwnData(handoff, HANDOFF_FIELD.REASON) || '',
    readOwnData(handoff, HANDOFF_FIELD.GENERATION) || '',
    readOwnData(handoff, HANDOFF_FIELD.OBSERVED_PUBLICATION_EPOCH) || '',
    readOwnData(handoff, HANDOFF_FIELD.OBSERVED_AUTHORITY_READY),
    readOwnData(handoff, HANDOFF_FIELD.RELEASE_AUTHORIZED),
    readOwnData(handoff, HANDOFF_FIELD.PENDING_TERMINAL_STATE) || '',
    readOwnData(handoff, HANDOFF_FIELD.PENDING_TERMINAL_REASON) || '',
    arrayPrototypeJoin(
      readOwnData(handoff, HANDOFF_FIELD.PENDING_NODE_IDS) || [],
      SIGNATURE_LIST_SEPARATOR,
    ),
    arrayPrototypeJoin(
      readOwnData(startupAuthority, AUTHORITY_CANONICAL_NODE_IDS_FIELD) || [],
      SIGNATURE_LIST_SEPARATOR,
    ),
    readOwnData(startupAuthority, AUTHORITY_STATE_FIELD) || '',
    readOwnData(startupAuthority, AUTHORITY_READY_FIELD),
    readOwnData(
      readOwnData(startupAuthority, AUTHORITY_PRIORITY_SUMMARY_FIELD),
      AUTHORITY_PRIORITY_SUMMARY_SATISFIED_FIELD,
    ),
    arrayPrototypeJoin(
      readOwnData(startupAuthority, AUTHORITY_REASON_CODES_FIELD) || [],
      SIGNATURE_LIST_SEPARATOR,
    ),
    readOwnData(
      normalizedAuthority,
      NORMALIZED_AUTHORITY_PUBLICATION_EPOCH_FIELD,
    ) || '',
    readOwnData(
      normalizedAuthority,
      NORMALIZED_AUTHORITY_FENCE_IDENTITY_FIELD,
    ) || '',
    readOwnData(handoff, HANDOFF_FIELD.FENCE_IDENTITY) || '',
  ], SIGNATURE_PART_SEPARATOR);
}

function formationReleaseStateIsTerminalOrPending(state) {
  return state === FORMATION_RELEASE_HANDOFF_STATE.TERMINAL_PENDING ||
    state === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE ||
    state === FORMATION_RELEASE_HANDOFF_STATE.REVOKED;
}

function localConnectionIdentity(router) {
  if (typeof router.getLocalBootIncarnationIdentity !== 'function') {
    return null;
  }
  return router.getLocalBootIncarnationIdentity();
}

function appendRemoteConnectionEvidence(
  evidence,
  rows,
  router,
  localNodeId,
  localIdentity,
) {
  for (let index = 0; index < rows.length; index += 1) {
    const rowDescriptor = objectGetOwnPropertyDescriptor(rows, index);
    const row = rowDescriptor && objectHasOwn(rowDescriptor, 'value') ?
      rowDescriptor.value :
      null;
    const nodeId = readOwnData(row, COLUMN.NODE_ID);
    if (typeof nodeId !== 'string' || nodeId.length === 0) continue;
    if (nodeId === localNodeId && localIdentity) continue;
    const current = router.getCurrentPrimaryConnectionBootIncarnation(nodeId);
    if (current) arrayPrototypePush(evidence, current);
  }
}

const formationReleaseMethods = {
  getFormationReleaseConnectionEvidence() {
    const evidence = [];
    const rows = this.getNodeRows();
    const router = this.messageRouter;
    if (
      !arrayIsArray(rows) ||
      typeof router?.getCurrentPrimaryConnectionBootIncarnation !== 'function'
    ) {
      return evidence;
    }
    const localIdentity = localConnectionIdentity(router);
    if (localIdentity) arrayPrototypePush(evidence, localIdentity);
    appendRemoteConnectionEvidence(
      evidence,
      rows,
      router,
      this.nodeId,
      localIdentity,
    );
    return evidence;
  },

  getFormationReleasePublicationStorageOwner() {
    return this.membershipPublicationService?.controlPlanePublicationsOwner ||
      null;
  },

  validateFormationReleaseStartupAuthorityProjection(
    startupAuthority,
    projectionNodeId,
  ) {
    return validateFormationReleaseHandoffSeedProjection(
      startupAuthority,
      this.getNodeRows(),
      projectionNodeId,
      this.formationReleaseAuthorityNodeId,
      this.getFormationReleaseConnectionEvidence(),
    );
  },

  getFormationReleaseAuthorityBootIncarnation(authorityNodeId) {
    const evidence = this.getFormationReleaseConnectionEvidence();
    for (let index = 0; index < evidence.length; index += 1) {
      const current = evidence[index];
      if (readOwnData(current, 'nodeId') !== authorityNodeId) continue;
      const bootIncarnation = readOwnData(current, 'bootIncarnation');
      return numberIsSafeInteger(bootIncarnation) && bootIncarnation > 0 ?
        bootIncarnation : FORMATION_RELEASE_BOOT_INCARNATION_ABSENT;
    }
    return FORMATION_RELEASE_BOOT_INCARNATION_ABSENT;
  },

  scheduleFormationReleaseHandoffPublication(handoff, observedAt) {
    if (
      !readOwnData(handoff, 'generation') ||
      readOwnData(handoff, 'authorityNodeId') !== this.nodeId ||
      this.nodeId !== this.formationReleaseAuthorityNodeId
    ) {
      return;
    }
    this.formationReleaseHandoffPublicationCoordinator?.offer(
      handoff,
      observedAt,
    );
  },

  readFormationReleaseHandoffFromCache(
    authorityNodeId,
    authorityBootIncarnation,
  ) {
    return readFormationReleaseHandoffPublicationFromCache(
      this.systemTableCache,
      authorityNodeId,
      authorityBootIncarnation,
    );
  },

  async readFormationReleaseHandoffFromAuthority(
    authorityNodeId,
    authorityBootIncarnation,
  ) {
    const storageOwner = this.getFormationReleasePublicationStorageOwner();
    if (typeof storageOwner?.getPublication !== 'function') {
      return FORMATION_RELEASE_PUBLICATION_ABSENT;
    }
    const row = await storageOwner.getPublication(
      formationReleaseHandoffPublicationId(
        authorityNodeId,
        authorityBootIncarnation,
      ),
      {skipCacheWait: true},
    );
    return readFormationReleaseHandoffPublicationRow(
      row,
      authorityNodeId,
      authorityBootIncarnation,
    );
  },

  observeFormationReleaseHandoff(
    startupAuthority,
    observedAt,
    authorityNodeId,
    publishedHandoff,
    connectionEvidence,
  ) {
    const owner = this.formationReleaseHandoffClosureOwner;
    const nodeRows = this.getNodeRows();
    const authorityBootIncarnation =
      this.getFormationReleaseAuthorityBootIncarnation(authorityNodeId);
    owner?.restore(
      publishedHandoff || this.readFormationReleaseHandoffFromCache(
        authorityNodeId,
        authorityBootIncarnation,
      ),
      startupAuthority,
      nodeRows,
      observedAt,
      authorityNodeId,
      connectionEvidence,
    );
    return owner?.observe(
      startupAuthority,
      nodeRows,
      observedAt,
      authorityNodeId,
      connectionEvidence,
    );
  },

  projectFormationReleaseHandoff(
    startupAuthority,
    observedAt,
    authorityNodeId,
    projectionNodeId,
    publishedHandoff,
    connectionEvidence,
  ) {
    if (this.nodeId === this.formationReleaseAuthorityNodeId) {
      return this.formationReleaseHandoffClosureOwner?.project(
        startupAuthority,
        this.getNodeRows(),
        observedAt,
        projectionNodeId,
        connectionEvidence,
      );
    }
    const authorityBootIncarnation =
      this.getFormationReleaseAuthorityBootIncarnation(authorityNodeId);
    return validateFormationReleaseHandoffConsumerContract(
      publishedHandoff || this.readFormationReleaseHandoffFromCache(
        authorityNodeId,
        authorityBootIncarnation,
      ),
      startupAuthority,
      this.getNodeRows(),
      observedAt,
      projectionNodeId,
      connectionEvidence,
    );
  },

  logFormationReleaseHandoffAuthorityTransition(
    handoff,
    authorityNodeId,
    startupAuthority,
    connectionEvidence,
  ) {
    if (!handoff || typeof handoff !== 'object') return;
    const handoffState = readOwnData(handoff, HANDOFF_FIELD.STATE);
    if (
      formationReleaseStateIsTerminalOrPending(handoffState) &&
      formationReleaseContractsEqual(
        handoff,
        this.lastFormationReleaseHandoffAuthorityLogContract,
      )
    ) {
      return;
    }
    const normalizedAuthority = buildAuthorityEvidence(startupAuthority);
    const signature = formationReleaseLogSignature(
      handoff,
      startupAuthority,
      normalizedAuthority,
    );
    if (signature === this.lastFormationReleaseHandoffAuthorityLogSignature) {
      return;
    }
    this.lastFormationReleaseHandoffAuthorityLogSignature = signature;
    this.lastFormationReleaseHandoffAuthorityLogContract = handoff;
    this.logger?.info?.('Formation release handoff authority transition', {
      nodeId: this.nodeId,
      authorityNodeId,
      authorityBootIncarnation:
        readOwnData(handoff, 'authorityBootIncarnation'),
      state: readOwnData(handoff, 'state'),
      reason: readOwnData(handoff, 'reason'),
      generation: readOwnData(handoff, 'generation'),
      releaseAuthorized: readOwnData(handoff, 'releaseAuthorized'),
      capturedPublicationEpoch:
        readOwnData(handoff, 'capturedPublicationEpoch'),
      observedPublicationEpoch:
        readOwnData(handoff, 'observedPublicationEpoch'),
      observedAuthorityReady: readOwnData(handoff, 'observedAuthorityReady'),
      observedRecoveryReasonCodes:
        readOwnData(handoff, 'observedRecoveryReasonCodes'),
      capturedCanonicalNodeIds: readOwnData(handoff, 'canonicalNodeIds'),
      observedCanonicalNodeIds:
        readOwnData(startupAuthority, 'canonicalStartupNodeIds'),
      observedStartupAuthorityState:
        readOwnData(startupAuthority, AUTHORITY_STATE_FIELD),
      observedStartupAuthorityReady:
        readOwnData(startupAuthority, AUTHORITY_READY_FIELD),
      observedStartupPrioritySpreadSatisfied: readOwnData(
        readOwnData(startupAuthority, AUTHORITY_PRIORITY_SUMMARY_FIELD),
        'satisfied',
      ),
      observedStartupAuthorityReasonCodes:
        readOwnData(startupAuthority, AUTHORITY_REASON_CODES_FIELD),
      observedStartupAuthorityPublicationEpoch:
        readOwnData(normalizedAuthority, 'publicationEpoch'),
      observedStartupAuthorityFenceIdentity:
        readOwnData(normalizedAuthority, 'fenceIdentity'),
      fenceIdentity: readOwnData(handoff, 'fenceIdentity'),
      physicalCohortEvidence: buildFormationReleasePhysicalEvidence(
        handoff,
        this.getNodeRows(),
        connectionEvidence,
      ),
      requiredCohort: readOwnData(handoff, 'requiredCohort'),
      readyNodeIds: readOwnData(handoff, 'readyNodeIds'),
      pendingNodeIds: readOwnData(handoff, 'pendingNodeIds'),
      pendingTerminalState:
        readOwnData(handoff, 'pendingTerminalState'),
      pendingTerminalReason:
        readOwnData(handoff, 'pendingTerminalReason'),
    });
  },

  applyFormationReleaseHandoff(
    startupAuthority,
    observedAt,
    authorityNodeId,
    {
      observeAuthority = false,
      publishedHandoff = null,
      projectionNodeId = authorityNodeId,
    } = {},
  ) {
    const connectionEvidence = this.getFormationReleaseConnectionEvidence();
    const handoff = observeAuthority ?
      this.observeFormationReleaseHandoff(
        startupAuthority,
        observedAt,
        authorityNodeId,
        publishedHandoff,
        connectionEvidence,
      ) :
      this.projectFormationReleaseHandoff(
        startupAuthority,
        observedAt,
        authorityNodeId,
        projectionNodeId,
        publishedHandoff,
        connectionEvidence,
      );
    if (observeAuthority) {
      const publicationIntent =
        this.formationReleaseHandoffClosureOwner?.publicationIntent?.() ||
        handoff;
      this.scheduleFormationReleaseHandoffPublication(
        publicationIntent,
        observedAt,
      );
      this.logFormationReleaseHandoffAuthorityTransition(
        handoff,
        authorityNodeId,
        startupAuthority,
        connectionEvidence,
      );
    }
    const projectedHandoff =
      projectionNodeId === authorityNodeId ||
      formationReleaseHandoffAuthorizesNode(handoff, projectionNodeId) ?
        handoff :
        null;
    return attachFormationReleaseHandoffToStartupAuthority(
      startupAuthority,
      projectedHandoff,
    );
  },
};

function installControlPlaneReadinessFormationReleaseMethods(prototype) {
  const descriptors = {};
  const names = objectKeys(formationReleaseMethods);
  for (let index = 0; index < names.length; index += 1) {
    descriptors[names[index]] = {
      configurable: true,
      value: formationReleaseMethods[names[index]],
      writable: true,
    };
  }
  objectDefineProperties(prototype, descriptors);
}

export {installControlPlaneReadinessFormationReleaseMethods};
