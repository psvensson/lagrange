import {NODE_STATE, TABLES} from '../constants/index.js';
import {
  appendArrayValue,
  encodeSignatureValues,
  readOwnDataValue,
} from './readiness-planning-version-contract.js';

const arrayIsArray = Array.isArray;
const arraySort = Function.call.bind(Array.prototype.sort);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const READINESS_PLANNING_CONNECTED_STATE = 'connected';

function readOwnerKey(record) {
  const snakeCaseNodeId = readOwnDataValue(record, 'node_id');
  if (typeof snakeCaseNodeId === 'string') return snakeCaseNodeId;
  const camelCaseNodeId = readOwnDataValue(record, 'nodeId');
  return typeof camelCaseNodeId === 'string' ? camelCaseNodeId : '';
}

function hasReadinessLiveTransportEvidence(nodeId, messageRouter) {
  if (typeof messageRouter?.getConnectionState !== 'function') return false;
  try {
    const state = messageRouter.getConnectionState(nodeId);
    return typeof state === 'string' &&
      stringToLowerCase(state) === READINESS_PLANNING_CONNECTED_STATE;
  } catch {
    return false;
  }
}

function readSharedNodeRows(service) {
  if (typeof service?.systemTableCache?.getAll !== 'function') return [];
  try {
    const rows = service.systemTableCache.getAll(TABLES.NODES);
    // The cache is the trusted row owner: getAll serves its own sanitized
    // (fastJsonClone, own enumerable data only) deep-frozen shared rows, and
    // every consumer here reads single fields through descriptor-based
    // readOwnDataValue/readOwnerKey. Re-running the full strict record-array
    // copy on each call re-validated the owner's own frozen output on every
    // planning enqueue and read — the dominant walk-count amplifier on the
    // live seed — while adding no admission the per-field reads need. A
    // non-array (hostile or absent) source still fails closed to [].
    return arrayIsArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function readFormationBootstrapOwnerKey(service, cachedRows = null) {
  const rows = arrayIsArray(cachedRows) ?
    cachedRows :
    readSharedNodeRows(service);
  for (let index = 0; index < rows.length; index++) {
    const status = readOwnDataValue(rows[index], 'status');
    const ownerKey = readOwnerKey(rows[index]);
    if (typeof status === 'string' &&
      stringToLowerCase(status) === NODE_STATE.JOINING &&
      hasReadinessLiveTransportEvidence(ownerKey, service?.messageRouter)) {
      return ownerKey;
    }
  }
  return '';
}

function readFormationEpochKey(service, cachedRows = null) {
  const rows = arrayIsArray(cachedRows) ?
    cachedRows :
    readSharedNodeRows(service);
  const formationOwnerKeys = [];
  for (let index = 0; index < rows.length; index++) {
    const status = readOwnDataValue(rows[index], 'status');
    const ownerKey = readOwnerKey(rows[index]);
    if (typeof status === 'string' &&
      stringToLowerCase(status) === NODE_STATE.JOINING && ownerKey) {
      appendArrayValue(formationOwnerKeys, ownerKey);
    }
  }
  arraySort(formationOwnerKeys);
  return encodeSignatureValues(formationOwnerKeys);
}

export {
  readSharedNodeRows,
  readFormationBootstrapOwnerKey,
  readFormationEpochKey,
  readOwnerKey,
};
