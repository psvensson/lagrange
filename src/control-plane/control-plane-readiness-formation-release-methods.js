import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from
  './control-plane-readiness-planning-shared.js';
import {
  attachFormationReleaseHandoffToStartupAuthority,
  validateFormationReleaseHandoffConsumerContract,
} from './formation-release-handoff-contract.js';
import {
  FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
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

const OWN_DATA_VALUE_FIELD = 'value';
const FIELD_STATE = 'state';
const FIELD_REASON = 'reason';
const FIELD_GENERATION = 'generation';
const FIELD_OBSERVED_PUBLICATION_EPOCH = 'observedPublicationEpoch';
const FIELD_OBSERVED_AUTHORITY_READY = 'observedAuthorityReady';
const FIELD_RELEASE_AUTHORIZED = 'releaseAuthorized';
const FIELD_PENDING_NODE_IDS = 'pendingNodeIds';
const EMPTY_STRING = '';
const EMPTY_ARRAY_JOIN_SEPARATOR = ',';
const SIGNATURE_FIELD_SEPARATOR = '|';
// Explicit typed-outcome vocabulary (system-guidelines §4.5): no captured
// authority boot incarnation is an explicit none token, never a raw null.
const NO_AUTHORITY_BOOT_INCARNATION = 'none';

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

function formationReleaseLogSignature(handoff) {
  return arrayPrototypeJoin([
    readOwnData(handoff, FIELD_STATE) || EMPTY_STRING,
    readOwnData(handoff, FIELD_REASON) || EMPTY_STRING,
    readOwnData(handoff, FIELD_GENERATION) || EMPTY_STRING,
    readOwnData(handoff, FIELD_OBSERVED_PUBLICATION_EPOCH) || EMPTY_STRING,
    readOwnData(handoff, FIELD_OBSERVED_AUTHORITY_READY),
    readOwnData(handoff, FIELD_RELEASE_AUTHORIZED),
    arrayPrototypeJoin(
      readOwnData(handoff, FIELD_PENDING_NODE_IDS) || [],
      EMPTY_ARRAY_JOIN_SEPARATOR,
    ),
  ], SIGNATURE_FIELD_SEPARATOR);
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

  getFormationReleaseAuthorityBootIncarnation(authorityNodeId) {
    const evidence = this.getFormationReleaseConnectionEvidence();
    for (let index = 0; index < evidence.length; index += 1) {
      const current = evidence[index];
      if (readOwnData(current, 'nodeId') !== authorityNodeId) continue;
      const bootIncarnation = readOwnData(current, 'bootIncarnation');
      return numberIsSafeInteger(bootIncarnation) && bootIncarnation > 0 ?
        bootIncarnation : NO_AUTHORITY_BOOT_INCARNATION;
    }
    return NO_AUTHORITY_BOOT_INCARNATION;
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
      return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
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
    const cachedHandoff = this.readFormationReleaseHandoffFromCache(
      authorityNodeId,
      authorityBootIncarnation,
    );
    owner?.restore(
      publishedHandoff ||
        (cachedHandoff === FORMATION_RELEASE_HANDOFF_NO_CONTRACT ?
          null :
          cachedHandoff),
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
    const cachedHandoff = this.readFormationReleaseHandoffFromCache(
      authorityNodeId,
      authorityBootIncarnation,
    );
    return validateFormationReleaseHandoffConsumerContract(
      publishedHandoff ||
        (cachedHandoff === FORMATION_RELEASE_HANDOFF_NO_CONTRACT ?
          null :
          cachedHandoff),
      startupAuthority,
      this.getNodeRows(),
      observedAt,
      connectionEvidence,
    );
  },

  logFormationReleaseHandoffAuthorityTransition(
    handoff,
    authorityNodeId,
  ) {
    if (!handoff || typeof handoff !== 'object') return;
    const signature = formationReleaseLogSignature(handoff);
    if (signature === this.lastFormationReleaseHandoffAuthorityLogSignature) {
      return;
    }
    this.lastFormationReleaseHandoffAuthorityLogSignature = signature;
    this.logger?.info?.('Formation release handoff authority transition', {
      nodeId: this.nodeId,
      authorityNodeId,
      authorityBootIncarnation:
        readOwnData(handoff, 'authorityBootIncarnation'),
      state: readOwnData(handoff, 'state'),
      reason: readOwnData(handoff, 'reason'),
      generation: readOwnData(handoff, 'generation'),
      releaseAuthorized: readOwnData(handoff, FIELD_RELEASE_AUTHORIZED),
      capturedPublicationEpoch:
        readOwnData(handoff, 'capturedPublicationEpoch'),
      observedPublicationEpoch:
        readOwnData(handoff, 'observedPublicationEpoch'),
      observedAuthorityReady: readOwnData(handoff, FIELD_OBSERVED_AUTHORITY_READY),
      observedRecoveryReasonCodes:
        readOwnData(handoff, 'observedRecoveryReasonCodes'),
      requiredCohort: readOwnData(handoff, 'requiredCohort'),
      readyNodeIds: readOwnData(handoff, 'readyNodeIds'),
      pendingNodeIds: readOwnData(handoff, 'pendingNodeIds'),
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
      this.scheduleFormationReleaseHandoffPublication(handoff, observedAt);
      this.logFormationReleaseHandoffAuthorityTransition(
        handoff,
        authorityNodeId,
      );
    }
    return attachFormationReleaseHandoffToStartupAuthority(
      startupAuthority,
      handoff,
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
