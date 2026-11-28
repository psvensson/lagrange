import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ControlPlaneSystemTableGateway} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {buildCdcPersistenceOptions} from '../../src/node/replica-state-machine-transition.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {getSchemaByTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createCommittedServeEligibilityOwner} from './serve-eligibility-test-support.js';

const partitionId = 'services-p1';
const serviceId = 'new-table-replica';
const service = (node, role) => ({
  node_id: node, partition_id: partitionId, raft_role: role, status: 'active',
  service_id: partitionId + '-' + node, service_type: 'partition',
  address: node + '/partition/' + partitionId + '-' + node,
});

test('services publication recovers its submitted entry after the projected leader dies', async (t) => {
  ConfigurationManager.getInstance().initialize();
  const old = service('old', 'leader');
  const live = service('live', 'follower');
  // The projection still advertises term 2. The SQL engine must discover a
  // route from these ordinary partition/service rows on every delivery.
  const metadata = {
    tables: [{table_name: 'services', table_id: 'services', primaryKey: 'service_id',
      active_partition_version: 1, schema: getSchemaByTableName('services')}],
    partitions: [{partition_id: partitionId, table_name: 'services', partition_version: 1,
      partition_key_start: null, partition_key_end: null, state: 'NORMAL',
      leader_node_id: old.node_id, leader_term: 2}],
    services: [old, live],
  };
  const cache = {
    getAll: (type) => metadata[type] || [],
    filter(type, predicate) {
      return this.getAll(type).filter(predicate);
    },
    find(type, predicate) {
      return this.getAll(type).find(predicate);
    },
    get(type, key) {
      const field = {tables: 'table_id', partitions: 'partition_id', services: 'service_id'}[type];
      return this.find(type, (row) => row[field] === key);
    },
  };
  const deliveries = [];
  let stored;
  let electedTerm = 2;
  const engine = new SQLQueryEngine({
    nodeId: live.node_id, systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
    messageRouter: {
      async deliver(address, request) {
        t.match(request.sql, /INSERT\s+(?:OR IGNORE\s+)?INTO\s+["`]?services/i);
        deliveries.push({address, entry: request.entryId, key: request.idempotencyKey});
        if (address === old.address) {
          // Commit before SIGKILL, lose the answer, keep the replicated entry.
          electedTerm = 3;
          stored ??= {entry: request.entryId, key: request.idempotencyKey};
          return buildDeliveryEnvelope({errorCode: 'ROUTER_CONNECTION_CLOSED',
            error: 'Connection to node old closed', deferRetry: true,
            recoverableBeforeSend: false, retryAfterMs: 60000});
        }
        if (address !== live.address || electedTerm !== 3 || !stored ||
            request.entryId !== stored.entry ||
            request.idempotencyKey !== stored.key) throw new Error('unexpected publication delivery');
        return buildDeliveryEnvelope({acknowledged: true}, {success: true, changes: 1,
          rows: [], durableCommitWitness: {partitionId, entryId: stored.entry,
            idempotencyKey: stored.key, term: electedTerm, logIndex: 19, leaderNodeId: live.node_id,
            leaderReplicaId: live.service_id}});
      },
    },
  });
  const cdc = new CDCIntegrationService({nodeId: live.node_id, sqlQueryEngine: engine});
  cdc.initialize();
  const gateway = new ControlPlaneSystemTableGateway({nodeId: live.node_id,
    cdcIntegrationService: cdc});
  const result = await gateway.submitMutation({
    tableName: 'services', operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
    row: {service_id: serviceId, service_type: 'partition', status: 'pending',
      partition_id: 'orders-p1', node_id: live.node_id, address: 'live/partition/' + serviceId},
  }, {...buildCdcPersistenceOptions({state: 'pending'}, serviceId),
    ignoreExisting: true, queryTimeoutMs: 1500});
  t.equal(result.success, true);
  t.same(deliveries.map(({address}) => address), [old.address, live.address]);
  t.match(stored?.key, /^cpw-/);
  t.equal(stored?.entry, deriveParticipantEntryId(stored?.key, partitionId));
  t.same(deliveries.map(({entry, key}) => ({entry, key})), [stored, stored]);
});
