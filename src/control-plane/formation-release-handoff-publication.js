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
    return null;
  }
  return 'formation-release-handoff:' +
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
    return null;
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
  return readOwnString(transition, 'state') === contract.state &&
    readOwnString(transition, 'reasonCode') === contract.reason &&
    readOwnPositiveInteger(transition, 'at') === updatedAt;
}

function identityProjectionMatches(
  row,
  contract,
  authorityNodeId,
  authorityBootIncarnation,
) {
  return readOwnString(row, 'publication_id') ===
      formationReleaseHandoffPublicationId(
        authorityNodeId,
        authorityBootIncarnation,
      ) &&
    readOwnString(row, 'publication_kind') ===
      FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND &&
    readOwnString(row, 'publisher_node_id') === authorityNodeId &&
    readOwnPositiveInteger(row, 'publication_epoch') ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, 'source_topology_epoch') ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, 'source_snapshot_version') ===
      contract.observedPublicationEpoch;
}

function listProjectionMatches(row, contract) {
  return listsEqual(
    readStrictStringList(row, 'published_active_node_ids'),
    contract.canonicalNodeIds,
  ) &&
    listsEqual(
      readStrictStringList(row, 'required_ack_node_ids'),
      cohortNodeIds(contract),
    ) &&
    listsEqual(
      readStrictStringList(row, 'acknowledged_node_ids'),
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
    readOwnString(row, 'status') === expectedPublicationStatus(contract) &&
    readOwnString(row, 'reason_code') === contract.reason &&
    readOwnJsonValue(row, 'priority_partition_summary') === null &&
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
    return null;
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
    return null;
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
    return null;
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
    return null;
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
