import {TABLES} from '../constants/index.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  authorizeFormationReleaseHandoffPublicationIntent,
  normalizeFormationReleaseHandoffContract,
} from './formation-release-handoff-contract.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from './publication-owner-constants.js';
import {serializeControlPlanePublicationRow} from './system-row-normalizers.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeIndexOf = Function.call.bind(Array.prototype.indexOf);
const jsonParse = JSON.parse;
const numberIsSafeInteger = Number.isSafeInteger;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const OWN_DATA_VALUE_FIELD = 'value';
const FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND =
  'formation_release_handoff';
const FORMATION_RELEASE_HANDOFF_SUMMARY_FIELD =
  'formationReleaseHandoff';
const FORMATION_RELEASE_HANDOFF_PUBLICATION_ID_PREFIX =
  'formation-release-handoff:';
const ROW_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledged_node_ids',
  AT: 'at',
  PRIORITY_PARTITION_SUMMARY: 'priority_partition_summary',
  PUBLICATION_EPOCH: 'publication_epoch',
  PUBLICATION_ID: 'publication_id',
  PUBLICATION_KIND: 'publication_kind',
  PUBLISHED_ACTIVE_NODE_IDS: 'published_active_node_ids',
  PUBLISHER_NODE_ID: 'publisher_node_id',
  REASON_CODE: 'reason_code',
  REQUIRED_ACK_NODE_IDS: 'required_ack_node_ids',
  SOURCE_SNAPSHOT_VERSION: 'source_snapshot_version',
  SOURCE_TOPOLOGY_EPOCH: 'source_topology_epoch',
  STATE: 'state',
  STATUS: 'status',
  TRANSITION_REASON_CODE: 'reasonCode',
});
const FORMATION_RELEASE_PUBLICATION_ABSENT = null;

function formationReleaseHandoffPublicationId(
  authorityNodeId,
  authorityBootIncarnation,
) {
  if (
    typeof authorityNodeId !== 'string' ||
    authorityNodeId.length === 0 ||
    !numberIsSafeInteger(authorityBootIncarnation) ||
    authorityBootIncarnation <= 0
  ) {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  return FORMATION_RELEASE_HANDOFF_PUBLICATION_ID_PREFIX +
    `${authorityNodeId}:${authorityBootIncarnation}`;
}

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value :
    undefined;
}

function readOwnString(target, field) {
  const value = readOwnData(target, field);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOwnPositiveInteger(target, field) {
  const value = readOwnData(target, field);
  return numberIsSafeInteger(value) && value > 0 ? value : null;
}

function readOwnNullablePositiveInteger(target, field) {
  const value = readOwnData(target, field);
  return value === null ? null :
    numberIsSafeInteger(value) && value > 0 ? value : undefined;
}

function readOwnJsonValue(target, field) {
  const value = readOwnData(target, field);
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return jsonParse(value);
  } catch {
    return undefined;
  }
}

function readStrictStringList(target, field) {
  const values = readOwnJsonValue(target, field);
  if (!arrayIsArray(values)) {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  const result = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!objectHasOwn(values, index)) {
      return null;
    }
    const descriptor = objectGetOwnPropertyDescriptor(values, index);
    const value = descriptor && objectHasOwn(
      descriptor,
      OWN_DATA_VALUE_FIELD,
    ) ? descriptor.value : null;
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      arrayPrototypeIndexOf(result, value) !== -1
    ) {
      return null;
    }
    result[result.length] = value;
  }
  return result;
}

function listsEqual(left, right) {
  if (!left || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < right.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function cohortNodeIds(contract) {
  const result = [];
  for (let index = 0; index < contract.requiredCohort.length; index += 1) {
    result[result.length] = contract.requiredCohort[index].nodeId;
  }
  return result;
}

function expectedPublicationStatus(contract) {
  if (contract.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE) {
    return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
  }
  if (contract.state === FORMATION_RELEASE_HANDOFF_STATE.COMPLETE) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  return CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED;
}

function transitionHistoryMatches(row, contract, updatedAt) {
  const history = readOwnJsonValue(row, 'transition_history');
  if (!arrayIsArray(history) || history.length !== 1 ||
      !objectHasOwn(history, 0)) {
    return false;
  }
  const descriptor = objectGetOwnPropertyDescriptor(history, 0);
  const transition = descriptor && objectHasOwn(
    descriptor,
    OWN_DATA_VALUE_FIELD,
  ) ? descriptor.value : null;
  return readOwnString(transition, ROW_FIELD.STATE) === contract.state &&
    readOwnString(transition, ROW_FIELD.TRANSITION_REASON_CODE) ===
      contract.reason &&
    readOwnPositiveInteger(transition, ROW_FIELD.AT) === updatedAt;
}

function identityProjectionMatches(
  row,
  contract,
  authorityNodeId,
  authorityBootIncarnation,
) {
  return readOwnString(row, ROW_FIELD.PUBLICATION_ID) ===
      formationReleaseHandoffPublicationId(
        authorityNodeId,
        authorityBootIncarnation,
      ) &&
    readOwnString(row, ROW_FIELD.PUBLICATION_KIND) ===
      FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND &&
    readOwnString(row, ROW_FIELD.PUBLISHER_NODE_ID) === authorityNodeId &&
    readOwnPositiveInteger(row, ROW_FIELD.PUBLICATION_EPOCH) ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, ROW_FIELD.SOURCE_TOPOLOGY_EPOCH) ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, ROW_FIELD.SOURCE_SNAPSHOT_VERSION) ===
      contract.observedPublicationEpoch;
}

function listProjectionMatches(row, contract) {
  return listsEqual(
    readStrictStringList(row, ROW_FIELD.PUBLISHED_ACTIVE_NODE_IDS),
    contract.canonicalNodeIds,
  ) &&
    listsEqual(
      readStrictStringList(row, ROW_FIELD.REQUIRED_ACK_NODE_IDS),
      cohortNodeIds(contract),
    ) &&
    listsEqual(
      readStrictStringList(row, ROW_FIELD.ACKNOWLEDGED_NODE_IDS),
      contract.readyNodeIds,
    );
}

function lifecycleProjectionMatches(row, contract) {
  const createdAt = readOwnPositiveInteger(row, 'created_at');
  const updatedAt = readOwnPositiveInteger(row, 'updated_at');
  const publishedAt = readOwnNullablePositiveInteger(row, 'published_at');
  const closedAt = readOwnNullablePositiveInteger(row, 'closed_at');
  const terminal =
    contract.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE;
  return createdAt !== null &&
    updatedAt !== null &&
    createdAt === updatedAt &&
    readOwnString(row, ROW_FIELD.STATUS) ===
      expectedPublicationStatus(contract) &&
    readOwnString(row, ROW_FIELD.REASON_CODE) === contract.reason &&
    readOwnJsonValue(row, ROW_FIELD.PRIORITY_PARTITION_SUMMARY) === null &&
    (
      terminal ?
        publishedAt === updatedAt && closedAt === updatedAt :
        publishedAt === null && closedAt === null
    ) &&
    transitionHistoryMatches(row, contract, updatedAt);
}

function readFormationReleaseSummary(row) {
  const summary = readOwnJsonValue(row, 'membership_lifecycle_summary');
  return readOwnData(summary, FORMATION_RELEASE_HANDOFF_SUMMARY_FIELD);
}

function buildFormationReleaseHandoffPublicationRow(contract, now) {
  const normalized = authorizeFormationReleaseHandoffPublicationIntent(
    contract,
  );
  if (!normalized || !numberIsSafeInteger(now) || now <= 0) {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  const terminal =
    normalized.state !== FORMATION_RELEASE_HANDOFF_STATE.ACTIVE;
  return serializeControlPlanePublicationRow({
    publication_id: formationReleaseHandoffPublicationId(
      normalized.authorityNodeId,
      normalized.authorityBootIncarnation,
    ),
    publication_kind: FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND,
    publication_epoch: normalized.capturedPublicationEpoch,
    publisher_node_id: normalized.authorityNodeId,
    source_topology_epoch: normalized.capturedPublicationEpoch,
    source_snapshot_version: normalized.observedPublicationEpoch,
    published_active_node_ids: normalized.canonicalNodeIds,
    required_ack_node_ids: cohortNodeIds(normalized),
    acknowledged_node_ids: normalized.readyNodeIds,
    priority_partition_summary: null,
    membership_lifecycle_summary: {
      [FORMATION_RELEASE_HANDOFF_SUMMARY_FIELD]: normalized,
    },
    status: expectedPublicationStatus(normalized),
    reason_code: normalized.reason,
    created_at: now,
    updated_at: now,
    published_at: terminal ? now : null,
    closed_at: terminal ? now : null,
    transition_history: [{
      state: normalized.state,
      reasonCode: normalized.reason,
      at: now,
    }],
  });
}

function readFormationReleaseHandoffPublicationRow(
  row,
  authorityNodeId,
  authorityBootIncarnation,
) {
  if (!row || typeof row !== 'object') {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  const contract = normalizeFormationReleaseHandoffContract(
    readFormationReleaseSummary(row),
  );
  if (
    !contract ||
    contract.authorityNodeId !== authorityNodeId ||
    contract.authorityBootIncarnation !== authorityBootIncarnation ||
    !identityProjectionMatches(
      row,
      contract,
      authorityNodeId,
      authorityBootIncarnation,
    ) ||
    !listProjectionMatches(row, contract) ||
    !lifecycleProjectionMatches(row, contract)
  ) {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  return contract;
}

function readFormationReleaseHandoffPublicationFromCache(
  systemTableCache,
  authorityNodeId,
  authorityBootIncarnation,
) {
  const publicationId = formationReleaseHandoffPublicationId(
    authorityNodeId,
    authorityBootIncarnation,
  );
  if (!publicationId || typeof systemTableCache?.get !== 'function') {
    return FORMATION_RELEASE_PUBLICATION_ABSENT;
  }
  return readFormationReleaseHandoffPublicationRow(
    systemTableCache.get(TABLES.CONTROL_PLANE_PUBLICATIONS, publicationId),
    authorityNodeId,
    authorityBootIncarnation,
  );
}

export {
  FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND,
  buildFormationReleaseHandoffPublicationRow,
  formationReleaseHandoffPublicationId,
  normalizeFormationReleaseHandoffContract,
  readFormationReleaseHandoffPublicationFromCache,
  readFormationReleaseHandoffPublicationRow,
};
