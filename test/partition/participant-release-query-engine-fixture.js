// The existing seed bridge composes the real QueryEngine, CDC authoritative
// reads and gateway over native coordinator/progress partitions. Only routing
// metadata and transport observation are fixture-owned; no drain answer is.
import assert from 'node:assert/strict';
import path from 'node:path';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SeedRuntimeBridgeOwner} from '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {SQL_TRANSACTION_PARTICIPANTS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {CDCOperation, PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {QUERY_OPERATION} from '../../src/query/query-constants.js';
import {PARTICIPANT_RELEASE_TYPE} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {observeParticipantReleaseDelivery} from './participant-release-delivery-recorder.js';

function routeNativeServices(cache, services) {
  for (const service of services) {
    const leader = services.find((candidate) =>
      candidate.partitionId === service.partitionId &&
      candidate.raft.readStatus().role === RAFT_ROLE.LEADER);
    assert.ok(leader, 'routing metadata comes from an actual native leader');
    cache.applySystemTableChange(TABLES.TABLES, CDCOperation.INSERT,
      {table_id: service.tableId, table_name: service.tableName, active_partition_version: 1});
    cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT,
      {partition_id: service.partitionId, table_id: service.tableId,
        table_name: service.tableName, leader_node_id: leader.nodeId,
        replica_count: services.filter((candidate) =>
          candidate.partitionId === service.partitionId).length});
    cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
      {service_id: service.replicaId, replica_id: service.replicaId,
        partition_id: service.partitionId, node_id: service.nodeId,
        service_type: SERVICE_TYPE.PARTITION, status: SERVICE_STATUS.ACTIVE,
        raft_role: service.raft.readStatus().role,
        address: `${service.nodeId}/partition/${service.replicaId}`});
  }
}

async function attachQueryRelease({group, owners}) {
  const control = owners.control;
  const transport = control.transport;
  const partitionId = INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTION_PARTICIPANTS];
  const replicaId = `${partitionId}-release-fixture-r1`;
  const progress = new PartitionService(withFoundingStamp({
    partitionId, replicaId, replicaIds: [replicaId], nodeId: control.nodeId,
    tableId: TABLES.SQL_TRANSACTION_PARTICIPANTS,
    tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
    schema: SQL_TRANSACTION_PARTICIPANTS_SCHEMA, transport,
    systemTableCache: control.systemTableCache,
    dbPath: path.join(path.dirname(group.dbFileOf([group.services[0].replicaId])),
      'release-progress.sqlite'), deferElection: true,
  }));
  const cache = new SystemTableCache();
  const services = new Map([...group.services, control, progress].map((service) =>
    [service.replicaId, service]));
  const cdc = new CDCIntegrationService({nodeId: control.nodeId,
    systemTableCache: cache, messageRouter: transport, partitionServicesProvider: services,
    timeSource: control.timeSource});
  const originalEngine = control.sqlQueryEngine;
  const deliver = transport.deliver;
  const deliveries = [];
  const proofs = [];
  const observationErrors = [];
  let engine = null;
  const dispose = async () => {
    transport.deliver = deliver;
    control.sqlQueryEngine = originalEngine;
    cdc.markShuttingDown();
    try {
      await engine?.shutdown();
    } finally {
      await progress.shutdown();
    }
    assert.deepEqual(observationErrors, [], 'query release observer must not lose evidence');
  };
  try {
    await progress.initialize();
    await progress.raft.campaign();
    assert.equal(progress.raft.readStatus().role, RAFT_ROLE.LEADER);
    routeNativeServices(cache, [...services.values()]);
    cdc.initialize();
    const bridge = new SeedRuntimeBridgeOwner({delegates: {
      getCdcIntegrationService: () => cdc, getSystemTableCache: () => cache,
      getMessageRouter: () => transport, getNodeId: () => control.nodeId,
      getPartitionServices: () => services, getRebalanceCoordinator: () => null,
      getTimeSource: () => control.timeSource, getLogger: () => control.logger,
    }});
    engine = bridge.acquireSqlQueryEngine();
    control.sqlQueryEngine = engine;
    const routing = engine.queryExecutor.getPartitionRoutingSnapshot(group.services[0].partitionId);
    assert.equal(routing.canonicalLeaderObservationState, 'available', JSON.stringify(routing));
    assert.ok(routing.routableServiceCount > 0, JSON.stringify(routing));
    transport.deliver = observeParticipantReleaseDelivery(deliver, ([address, payload], answer) => {
      if (payload.type === QUERY_OPERATION.TRANSACTION) {
        deliveries.push(structuredClone({address, payload, answer}));
      }
      if (payload.type === PARTICIPANT_RELEASE_TYPE && payload.queryDrainProof) {
        proofs.push(structuredClone({address, payload, answer}));
      }
    }, observationErrors);
    return {engine, progress, deliveries, proofs, routing, dispose};
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'query release fixture setup/cleanup failed');
    }
    throw error;
  }
}

export {attachQueryRelease};
