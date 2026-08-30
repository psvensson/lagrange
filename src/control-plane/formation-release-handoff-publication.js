import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_READ_RECOVERY_ROUTING,
} from './control-plane-readiness-constants.js';
import {
  AUTHORIZATION_INTENT_OUTCOME,
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
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const OWN_DATA_VALUE_FIELD = 'value';
const FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND =
  'formation_release_handoff';
const FORMATION_RELEASE_HANDOFF_SUMMARY_FIELD =
  'formationReleaseHandoff';

const PUBLICATION_ID_PREFIX = 'formation-release-handoff:';
// Explicit typed-outcome vocabulary (system-guidelines §4.5): an identity that
// cannot be derived from its inputs is a typed absent/none token, never a raw
// null that encodes runtime state.
const NO_PUBLICATION_IDENTITY = 'none';
// The no-contract token is a truthy typed token, not a row: every boundary
// that chooses a contract source must test it through
// selectFormationReleaseHandoffContractSource, never through truthiness.
const FORMATION_RELEASE_HANDOFF_NO_CONTRACT = 'none';
// Typed outcome of the consumer's contract-source selection: DURABLE when the
// authority publication read holds a contract, CACHE when only the cached
// authority-published row holds one, NONE when neither does. Every source is
// still validated in the CONSUMER role before it can authorize a release.
const FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE = objectFreeze({
  DURABLE: 'durable',
  CACHE: 'cache',
  NONE: 'none',
});
// The durable readback that acknowledges a formation-release write is bound to
// the authoritative store (Raft/SQL), never the local cache; the cache is only
// a hint elsewhere, never the acknowledgement truth (system-guidelines §3).
const DURABLE_PUBLICATION_READ_OPTIONS = objectFreeze({skipCacheWait: true});
// The consumer's durable read of the authority publication is the one read
// exempt from the controlPlaneRecoveryEligible routing gate, exactly as the
// authority's publication write already is: while every replica host is
// recovery-pending a joiner hosting no replica would otherwise have no
// routable candidate (all_services_filtered_by_readiness) for the contract
// written for it.
const CONSUMER_DURABLE_PUBLICATION_READ_OPTIONS = objectFreeze({
  skipCacheWait: true,
  recoveryRouting:
    CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP,
});
const FIELD_STATE = 'state';
const FIELD_REASON_CODE = 'reasonCode';
const FIELD_AT = 'at';
const FIELD_PUBLICATION_ID = 'publication_id';
const FIELD_PUBLICATION_KIND = 'publication_kind';
const FIELD_PUBLISHER_NODE_ID = 'publisher_node_id';
const FIELD_PUBLICATION_EPOCH = 'publication_epoch';
const FIELD_SOURCE_TOPOLOGY_EPOCH = 'source_topology_epoch';
const FIELD_SOURCE_SNAPSHOT_VERSION = 'source_snapshot_version';
const FIELD_PUBLISHED_ACTIVE_NODE_IDS = 'published_active_node_ids';
const FIELD_REQUIRED_ACK_NODE_IDS = 'required_ack_node_ids';
const FIELD_ACKNOWLEDGED_NODE_IDS = 'acknowledged_node_ids';
const FIELD_STATUS = 'status';
const FIELD_REASON_CODE_SNAKE = 'reason_code';
const FIELD_PRIORITY_PARTITION_SUMMARY = 'priority_partition_summary';

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
    return NO_PUBLICATION_IDENTITY;
  }
  return PUBLICATION_ID_PREFIX +
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
  return readOwnString(transition, FIELD_STATE) === contract.state &&
    readOwnString(transition, FIELD_REASON_CODE) === contract.reason &&
    readOwnPositiveInteger(transition, FIELD_AT) === updatedAt;
}

function identityProjectionMatches(
  row,
  contract,
  authorityNodeId,
  authorityBootIncarnation,
) {
  return readOwnString(row, FIELD_PUBLICATION_ID) ===
      formationReleaseHandoffPublicationId(
        authorityNodeId,
        authorityBootIncarnation,
      ) &&
    readOwnString(row, FIELD_PUBLICATION_KIND) ===
      FORMATION_RELEASE_HANDOFF_PUBLICATION_KIND &&
    readOwnString(row, FIELD_PUBLISHER_NODE_ID) === authorityNodeId &&
    readOwnPositiveInteger(row, FIELD_PUBLICATION_EPOCH) ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, FIELD_SOURCE_TOPOLOGY_EPOCH) ===
      contract.capturedPublicationEpoch &&
    readOwnPositiveInteger(row, FIELD_SOURCE_SNAPSHOT_VERSION) ===
      contract.observedPublicationEpoch;
}

function listProjectionMatches(row, contract) {
  return listsEqual(
    readStrictStringList(row, FIELD_PUBLISHED_ACTIVE_NODE_IDS),
    contract.canonicalNodeIds,
  ) &&
    listsEqual(
      readStrictStringList(row, FIELD_REQUIRED_ACK_NODE_IDS),
      cohortNodeIds(contract),
    ) &&
    listsEqual(
      readStrictStringList(row, FIELD_ACKNOWLEDGED_NODE_IDS),
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
    readOwnString(row, FIELD_STATUS) === expectedPublicationStatus(contract) &&
    readOwnString(row, FIELD_REASON_CODE_SNAKE) === contract.reason &&
    readOwnJsonValue(row, FIELD_PRIORITY_PARTITION_SUMMARY) === null &&
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
  const authorization = authorizeFormationReleaseHandoffPublicationIntent(
    contract,
  );
  if (
    authorization.outcome !== AUTHORIZATION_INTENT_OUTCOME.AUTHORIZED ||
    !numberIsSafeInteger(now) ||
    now <= 0
  ) {
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
  }
  const normalized = authorization.contract;
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
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
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
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
  }
  return contract;
}

async function readPublicationRowWithOptions(
  storageOwner,
  authorityNodeId,
  authorityBootIncarnation,
  readOptions,
) {
  if (typeof storageOwner?.getPublication !== 'function') {
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
  }
  const publicationId = formationReleaseHandoffPublicationId(
    authorityNodeId,
    authorityBootIncarnation,
  );
  if (publicationId === NO_PUBLICATION_IDENTITY) {
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
  }
  return readFormationReleaseHandoffPublicationRow(
    await storageOwner.getPublication(publicationId, readOptions),
    authorityNodeId,
    authorityBootIncarnation,
  );
}

// Authority-side acknowledgement readback (recovery-eligible routing).
async function readDurableFormationReleaseHandoffPublicationRow(
  storageOwner,
  authorityNodeId,
  authorityBootIncarnation,
) {
  return readPublicationRowWithOptions(
    storageOwner,
    authorityNodeId,
    authorityBootIncarnation,
    DURABLE_PUBLICATION_READ_OPTIONS,
  );
}

// Consumer-side durable read of the authority publication (bootstrap lane).
async function readConsumerFormationReleaseHandoffPublicationRow(
  storageOwner,
  authorityNodeId,
  authorityBootIncarnation,
) {
  return readPublicationRowWithOptions(
    storageOwner,
    authorityNodeId,
    authorityBootIncarnation,
    CONSUMER_DURABLE_PUBLICATION_READ_OPTIONS,
  );
}

function isFormationReleaseHandoffContract(value) {
  return value !== FORMATION_RELEASE_HANDOFF_NO_CONTRACT &&
    typeof value === 'object' &&
    value !== null;
}

// The consumer's contract-source decision: the durable read wins when it
// holds a contract; the cached authority-published row is the fallback; the
// no-contract token of either source is absent, never a row.
function selectFormationReleaseHandoffContractSource(
  durableContract,
  cachedContract,
) {
  if (isFormationReleaseHandoffContract(durableContract)) {
    return {
      source: FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE.DURABLE,
      contract: durableContract,
    };
  }
  if (isFormationReleaseHandoffContract(cachedContract)) {
    return {
      source: FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE.CACHE,
      contract: cachedContract,
    };
  }
  return {
    source: FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE.NONE,
    contract: FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
  };
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
  if (
    publicationId === NO_PUBLICATION_IDENTITY ||
    typeof systemTableCache?.get !== 'function'
  ) {
    return FORMATION_RELEASE_HANDOFF_NO_CONTRACT;
  }
  return readFormationReleaseHandoffPublicationRow(
    systemTableCache.get(TABLES.CONTROL_PLANE_PUBLICATIONS, publicationId),
    authorityNodeId,
    authorityBootIncarnation,
  );
}

export {
  FORMATION_RELEASE_HANDOFF_CONTRACT_SOURCE,
  FORMATION_RELEASE_HANDOFF_NO_CONTRACT,
  buildFormationReleaseHandoffPublicationRow,
  formationReleaseHandoffPublicationId,
  normalizeFormationReleaseHandoffContract,
  readConsumerFormationReleaseHandoffPublicationRow,
  readDurableFormationReleaseHandoffPublicationRow,
  readFormationReleaseHandoffPublicationFromCache,
  readFormationReleaseHandoffPublicationRow,
  selectFormationReleaseHandoffContractSource,
};
