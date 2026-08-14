import {NODE_STATE, TABLES} from '../constants/index.js';
import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {
  appendArrayValue,
  encodeSignatureValues,
  readOwnDataValue,
} from './readiness-planning-version-contract.js';

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

function readCachedNodeRows(service) {
  if (typeof service?.systemTableCache?.getAll !== 'function') return [];
  try {
    const rows = service.systemTableCache.getAll(TABLES.NODES);
    return copyDenseOwnDataRecordArray(rows) || [];
  } catch {
    return [];
  }
}

function readFormationBootstrapOwnerKey(service) {
  const rows = readCachedNodeRows(service);
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

function readFormationEpochKey(service) {
  const rows = readCachedNodeRows(service);
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
  readCachedNodeRows,
  readFormationBootstrapOwnerKey,
  readFormationEpochKey,
  readOwnerKey,
};
