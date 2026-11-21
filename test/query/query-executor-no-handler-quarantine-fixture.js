// The query executor's no-handler address quarantine, observed through the
// production executor on the node clock it is given.
//
// On the subject path, unchanged: QueryExecutor (routing snapshot, canonical
// leader candidates, candidate eligibility, the delivery loop and the
// quarantine owner, query-executor-temporary-unroutable-addresses.js), with a
// VirtualTimeSource as its node clock (`nowFn`, as
// sql-query-engine-instance-initializer.js hands it the engine's clock).
//
// Substituted, and nothing else: the hop between the planner node's router and
// the nodes of the services-p1 replicas. Each replica node answers from its
// router's handler table as the receiving router does
// (message-router-inbound-dispatch.js handleServiceMessage): an address with
// no registered handler is answered "no handler", which reaches the sender as
// the router's no-handler fact (message-router-pending-response-ledger.js
// unansweredServiceResponseError, classified by the transport owner); a
// registered handler's answer is delivered. The follower's handler serves from
// the start, so a read that fell back to the follower would be answered.
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {buildDeliveryEnvelope, classifyThrownDeliveryError} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';

const PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
const NODE = Object.freeze({
  PLANNER: 'quarantine-planner-node',
  LEADER: 'quarantine-leader-node',
  FOLLOWER: 'quarantine-follower-node',
});
const ADDRESS_SEPARATOR = '/';
const CONNECTED = 'connected';
const RECOVERY = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
// The SERVICES owner-fact read as the coordinator's topology guard issues it:
// an owner-RPC read that requires the canonical leader, on the recovery
// readiness dimension, within a bounded grant.
const OWNER_FACT_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  routingReadinessDimension: RECOVERY,
});
const OWNER_FACT_SQL = `SELECT service_id, node_id FROM ${SYSTEM_TABLE_NAME.SERVICES}`;
const OWNER_FACT_TIMEOUT_MS = 2000;
// One delivery decision per read: the caller's own cadence is the retry
// under observation (the executor's in-read retry delay runs on host timers).
const OWNER_FACT_READ_ATTEMPTS = 1;

// The published SERVICES row of one services-p1 replica.
function replicaRow(nodeId, raftRole) {
  const replicaId = `${PARTITION_ID}-${nodeId}`;
  return Object.freeze({
    service_id: replicaId,
    replica_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    raft_role: raftRole,
    address: [nodeId, ENTITY_TYPE.PARTITION, replicaId].join(ADDRESS_SEPARATOR),
    status: SERVICE_STATUS.ACTIVE,
  });
}

// The planner node's cache: the partition with its published leader and the
// replicas' SERVICES rows.
function createPlannerCache(serviceRows) {
  const partitions = [Object.freeze({
    partition_id: PARTITION_ID,
    table_id: SYSTEM_TABLE_NAME.SERVICES,
    leader_node_id: NODE.LEADER,
  })];
  return {
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) return serviceRows.filter(predicate);
      if (type === TABLES.PARTITIONS) return partitions.filter(predicate);
      return [];
    },
  };
}

// The planner router's hop to the replica nodes, each answering from its
// router's handler table. Every hop is recorded with the node time it left.
function openReplicaHops(clock) {
  const handlers = new Map();
  const hops = [];
  const router = {
    getConnectionState: () => CONNECTED,
    async deliver(address, request) {
      const handler = handlers.get(address);
      hops.push(Object.freeze({address, atMs: clock.now(), handled: Boolean(handler)}));
      if (!handler) {
        const refusal = Object.assign(
          new Error(ROUTER_ERROR_MSG.noHandlerForAddress(address)), {noHandler: true});
        return buildDeliveryEnvelope(classifyThrownDeliveryError(refusal));
      }
      return buildDeliveryEnvelope({acknowledged: true}, await handler(request));
    },
  };
  return {router, hops, register: (address, handler) => handlers.set(address, handler)};
}

/**
 * The planner node's executor and the services-p1 replicas' nodes. The
 * leader's handler is not registered until serveLeader().
 * @return {Object} {clock, executor, hops, leaderAddress, followerAddress,
 *   quarantineMs, serveLeader, readOwnerFact}
 */
function openQuarantineWorld() {
  const clock = new VirtualTimeSource({startMs: Date.now()});
  const leaderRow = replicaRow(NODE.LEADER, RAFT_ROLE.LEADER);
  const followerRow = replicaRow(NODE.FOLLOWER, RAFT_ROLE.FOLLOWER);
  const replicaHops = openReplicaHops(clock);
  const serve = (row) => replicaHops.register(row.address, async () => ({
    success: true,
    rows: [{service_id: row.service_id, node_id: row.node_id}],
  }));
  serve(followerRow);
  const executor = new QueryExecutor({
    nodeId: NODE.PLANNER,
    nowFn: () => clock.now(),
    messageRouter: replicaHops.router,
    systemCache: createPlannerCache([leaderRow, followerRow]),
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });
  executor.readRetryAttempts = OWNER_FACT_READ_ATTEMPTS;
  return Object.freeze({
    clock,
    executor,
    hops: replicaHops.hops,
    leaderAddress: leaderRow.address,
    followerAddress: followerRow.address,
    // The quarantine owner's own duration for this partition.
    quarantineMs: executor.resolveNoHandlerAddressQuarantineMs(PARTITION_ID),
    serveLeader: () => serve(leaderRow),
    readOwnerFact: () => executor.executeOnPartition(PARTITION_ID, OWNER_FACT_SQL, [],
      true, true, false, {
        readAuthority: OWNER_FACT_READ_AUTHORITY,
        routingReadinessDimension: RECOVERY,
        timeoutMs: OWNER_FACT_TIMEOUT_MS,
      }),
  });
}

export {openQuarantineWorld};
