import {AddressManager} from '../address/address-manager.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../constants/index.js';
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  resolveCanonicalPartitionLeaderObservation,
} from '../query/canonical-leader-routing.js';

const FUNCTION_TYPE = 'function';
const EXACTLY_ONE_ENDPOINT = 1;

function isLedgerPartitionService(row) {
  return row?.[COLUMN.PARTITION_ID] === LEDGER_PARTITION_ID &&
    row[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    row[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE;
}

function isBoundPartitionAddress(address, nodeId, replicaId) {
  const addresses = AddressManager.getInstance();
  if (!addresses.validate(address).valid) return false;
  const endpoint = addresses.parse(address);
  return endpoint.nodeId === nodeId && endpoint.serviceType === SERVICE_TYPE.PARTITION &&
    endpoint.serviceId === replicaId;
}

// PARTITIONS owns the leader identity. SERVICES supplies that leader's exact
// active endpoint. Partition service rows publish follower for normal leaders.
function resolvePlacementLedgerRoute(cache) {
  if (!cache) return null;
  const partition = cache.get(TABLES.PARTITIONS, LEDGER_PARTITION_ID);
  const serviceRows = cache.getAll(TABLES.SERVICES).filter(isLedgerPartitionService);
  const leader = resolveCanonicalPartitionLeaderObservation({partition, serviceRows});
  if (leader.state !== CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.AVAILABLE) return null;
  const candidates = serviceRows.filter((row) => row[COLUMN.NODE_ID] === leader.leaderNodeId);
  if (candidates.length !== EXACTLY_ONE_ENDPOINT) return null;
  const [candidate] = candidates;
  const nodeId = candidate[COLUMN.NODE_ID];
  const replicaId = candidate[COLUMN.REPLICA_ID];
  const address = candidate[COLUMN.ADDRESS];
  if (candidate[COLUMN.SERVICE_ID] !== replicaId ||
      !isBoundPartitionAddress(address, nodeId, replicaId)) return null;
  return {nodeId, replicaId, address};
}

function resolvePlacementLedgerDelivery(coordinator) {
  const transport = coordinator.messageRouter;
  const deliver = transport?.deliver;
  if (typeof deliver !== FUNCTION_TYPE) return null;
  const owner = coordinator.resolveRemoteLedgerLeader();
  return owner === null ? null : {owner, transport};
}

export {resolvePlacementLedgerDelivery, resolvePlacementLedgerRoute};
