import {AddressManager} from '../address/address-manager.js';
import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {
  ReplicaOperationField,
} from '../rebalancer/replica-operation-constants.js';
import {
  MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG,
} from './message-group-service-handler-constants.js';

function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO;
}

function collectRequestedStrings(request, field) {
  return Array.isArray(request?.[field]) ?
    request[field].filter(isNonEmptyString) :
    [];
}

function collectExistingReplicaTopology({
  services,
  addressManager,
  replicaIds,
  peerAddresses,
  seenReplicaIds,
}) {
  for (const service of services) {
    const serviceReplicaId = service.service_id || service.replica_id;
    if (!serviceReplicaId) {
      continue;
    }
    if (!seenReplicaIds.has(serviceReplicaId)) {
      seenReplicaIds.add(serviceReplicaId);
      replicaIds.push(serviceReplicaId);
    }
    const peerAddress = service.address ||
      (service.node_id ?
        addressManager.format(
          service.node_id,
          ENTITY_TYPE.MESSAGE_GROUP,
          serviceReplicaId,
        ) :
        null);
    if (peerAddress && !peerAddresses.includes(peerAddress)) {
      peerAddresses.push(peerAddress);
    }
  }
}

function addMissingValues({values, seenValues, targetValues}) {
  for (const value of values) {
    if (!seenValues.has(value)) {
      seenValues.add(value);
      targetValues.push(value);
    }
  }
}

function addMissingPeerAddresses({values, peerAddresses}) {
  for (const value of values) {
    if (!peerAddresses.includes(value)) {
      peerAddresses.push(value);
    }
  }
}

function assertCompleteReplicaTopology({
  topologyMustBeComplete,
  replicaIds,
  replicaId,
  peerAddresses,
  selfAddress,
  groupId,
}) {
  const hasPeerReplica = replicaIds.some((value) => value !== replicaId);
  const hasPeerAddress = peerAddresses.some((value) => value !== selfAddress);
  if (topologyMustBeComplete &&
      (!hasPeerReplica ||
        !hasPeerAddress ||
        peerAddresses.length < replicaIds.length)) {
    throw new Error(
      MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG.CREATE_TOPOLOGY_REQUIRED(
        groupId,
        replicaId,
      ),
    );
  }
}

function listMessageGroupServices(systemTableCache, groupId) {
  return systemTableCache?.filter?.(
    SYSTEM_TABLE_NAME.SERVICES,
    (row) =>
      row?.service_type === SERVICE_TYPE.MESSAGE_GROUP &&
      row?.group_id === groupId,
  ) || [];
}

function buildMessageGroupReplicaOptions({
  groupId,
  replicaId,
  request = {},
  nodeId,
  systemTableCache,
}) {
  const requestedReplicaIds = collectRequestedStrings(
    request,
    ReplicaOperationField.REPLICA_IDS,
  );
  const requestedPeerAddresses = collectRequestedStrings(
    request,
    ReplicaOperationField.PEER_ADDRESSES,
  );

  const addressManager = AddressManager.getInstance();
  const services = listMessageGroupServices(systemTableCache, groupId);
  const topologyMustBeComplete =
    requestedReplicaIds.length > NUM.ZERO ||
    requestedPeerAddresses.length > NUM.ZERO ||
    services.length > NUM.ZERO;

  const replicaIds = [];
  const peerAddresses = [];
  const seenReplicaIds = new Set();

  collectExistingReplicaTopology({
    services,
    addressManager,
    replicaIds,
    peerAddresses,
    seenReplicaIds,
  });
  addMissingValues({
    values: requestedReplicaIds,
    seenValues: seenReplicaIds,
    targetValues: replicaIds,
  });
  addMissingValues({
    values: [replicaId],
    seenValues: seenReplicaIds,
    targetValues: replicaIds,
  });

  const selfAddress = addressManager.format(
    nodeId,
    ENTITY_TYPE.MESSAGE_GROUP,
    replicaId,
  );
  addMissingPeerAddresses({
    values: [selfAddress, ...requestedPeerAddresses],
    peerAddresses,
  });
  assertCompleteReplicaTopology({
    topologyMustBeComplete,
    replicaIds,
    replicaId,
    peerAddresses,
    selfAddress,
    groupId,
  });

  return {
    groupId,
    replicaId,
    replicaIds,
    peerAddresses,
    deferElection: false,
    createDelayMs: NUM.ZERO,
  };
}

export {buildMessageGroupReplicaOptions};
