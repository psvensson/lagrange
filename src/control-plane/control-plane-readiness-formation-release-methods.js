import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from
  './control-plane-readiness-planning-shared.js';
import {
  attachFormationReleaseHandoffToStartupAuthority,
  validateFormationReleaseHandoffConsumerContract,
} from './formation-release-handoff-contract.js';
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

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, 'value') ?
    descriptor.value :
    undefined;
}

function formationReleaseLogSignature(handoff) {
  return arrayPrototypeJoin([
    readOwnData(handoff, 'state') || '',
    readOwnData(handoff, 'reason') || '',
    readOwnData(handoff, 'generation') || '',
    readOwnData(handoff, 'observedPublicationEpoch') || '',
    readOwnData(handoff, 'observedAuthorityReady'),
    readOwnData(handoff, 'releaseAuthorized'),
    arrayPrototypeJoin(readOwnData(handoff, 'pendingNodeIds') || [], ','),
  ], '|');
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
        bootIncarnation : null;
    }
    return null;
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
    if (typeof storageOwner?.getPublication !== 'function') return null;
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
      releaseAuthorized: readOwnData(handoff, 'releaseAuthorized'),
      capturedPublicationEpoch:
        readOwnData(handoff, 'capturedPublicationEpoch'),
      observedPublicationEpoch:
        readOwnData(handoff, 'observedPublicationEpoch'),
      observedAuthorityReady: readOwnData(handoff, 'observedAuthorityReady'),
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
