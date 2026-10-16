// Test composition of existing native groups and actual registered replica
// handlers. Census cache rows below are projections of actual native status;
// they route the production cure and are never fabricated committed rows.
import assert from 'node:assert/strict';
import path from 'node:path';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES, WORKFLOW_STEP} from
  '../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {ReplicaOperationMessageType as MESSAGE, ReplicaOperationReason as REASON} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../../src/rebalancer/operation-workflow-owner-shared.js';
import {PriorityRecoverySupersededTarget} from
  '../../../src/rebalancer/priority-recovery-superseded-target.js';
import {ReplicaOperationRepository} from
  '../../../src/rebalancer/replica-operation-repository.js';
import {formAdmittedGroup} from '../../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../../partition/partition-release-fixture.js';
import {createLoopbackTransport} from '../../partition/partition-service-test-support.js';

const TABLE = 'completion_cure_rows';
const BUDGET_MS = 10000;
const TIMING = {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300};

function requestHandoff(service, {operationId, reason = REASON.REPLACE_TARGET_LEADER_ELECTION,
  attemptSeq} = {}) {
  return service.transport.deliver(`${service.nodeId}/service/replica-handler`, {
    type: MESSAGE.STEP_DOWN_REPLICA, operationId,
    partitionId: service.partitionId, replicaId: service.replicaId, reason,
    ...(attemptSeq === undefined ? {} : {attemptSeq}),
  });
}

// The operation is explicit in-memory ACTIVE caller intent, not a claimed
// persisted REPLACE row. Use the actual repository predicates and inherited
// handoff evaluator/dispatch/result builders; do not substitute the stronger
// terminal completion reader for the production target-witness interaction.
function replaceConsumerContext(source, target) {
  const operation = {operationId: 'runtime-consumer-replace',
    type: OPERATION_WORKFLOW_OWNER_SHARED.OperationType.REPLACE,
    workflowStep: WORKFLOW_STEP.ACTIVE,
    entityType: SERVICE_TYPE.PARTITION, entityId: source.partitionId,
    partitionId: source.partitionId, sourceNodeId: source.nodeId,
    targetNodeId: target.nodeId, sourceReplicaId: source.replicaId,
    targetReplicaId: target.replicaId, replicaId: target.replicaId};
  const repository = new ReplicaOperationRepository({nodeId: target.nodeId,
    systemTableCache: target.systemTableCache, logger: target.logger,
    timeSource: target.timeSource});
  const owner = Object.assign(Object.create(PriorityRecoverySupersededTarget.prototype),
    {messageRouter: source.transport, repository});
  return {owner, operation};
}

function refreshCureProjection(groups, cache) {
  for (const group of groups) {
    const leader = group.services.find((service) =>
      service.raft.readStatus().role === RAFT_ROLE.LEADER);
    assert.ok(leader, 'projection requires an actual native leader');
    cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT,
      {partition_id: leader.partitionId, table_id: TABLE,
        replica_count: group.services.length, leader_node_id: leader.nodeId});
    for (const service of group.services) {
      cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
        {service_id: service.replicaId, replica_id: service.replicaId,
          partition_id: service.partitionId, service_type: SERVICE_TYPE.PARTITION,
          node_id: service.nodeId, status: SERVICE_STATUS.ACTIVE,
          raft_role: service.raft.readStatus().role});
    }
  }
}

// The cure function is normally called after the rebalancer planning gates.
// This fixture supplies that caller precondition explicitly. It exercises the
// actual cure/handler/partition/consensus path, not UnifiedRebalancer startup,
// CDC delivery, or stabilization's separate policy.
function cureContext(service, cache) {
  return {entityType: SERVICE_TYPE.PARTITION, entityId: service.partitionId,
    nodeId: service.nodeId, replicaId: service.replicaId,
    get isLeader() {
      return service.isLeader;
    },
    get isShuttingDown() {
      return service.isShutdown;
    },
    isStabilized: () => true,
    systemTableCache: cache, messageRouter: service.transport, logger: service.logger,
    getCurrentReplicas: () => cache.filter(TABLES.SERVICES,
      (row) => row.partition_id === service.partitionId)};
}

async function nativeCureFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'cure-node-a'},
    logging: {level: 'fatal'}, raft: TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const transport = createLoopbackTransport();
  const groups = [];
  let owners = null;
  t.after(async () => {
    try {
      await owners?.dispose();
    } finally {
      const cleanup = await Promise.allSettled(groups.map((group) => group.dispose()));
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      assert.deepEqual(cleanup.filter((answer) => answer.status === 'rejected'), []);
    }
  });
  for (const [partitionId, nodes] of [
    ['completion-cure-p1', ['cure-node-a']],
    ['completion-cure-p2', ['cure-node-a', 'cure-node-b', 'cure-node-c']],
  ]) {
    groups.push(await formAdmittedGroup({partitionId,
      members: nodes.map((node, i) => [`${partitionId}-r${i + 1}`, node]),
      tempPrefix: 'runtime-completion-cure-', budgetMs: BUDGET_MS, transport,
      serviceOptions: {tableName: TABLE, tableId: TABLE,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}}}));
  }
  const all = groups.flatMap((group) => group.services);
  const source = groups[1].services[0];
  owners = await attachPartitionReleaseOwners(all, {
    directory: path.dirname(groups[0].dbFileOf([groups[0].services[0].replicaId])),
    budgetMs: BUDGET_MS});
  all.forEach((service) => service.raft.stopScheduling());
  const cache = source.systemTableCache;
  refreshCureProjection(groups, cache);
  return {groups, source, transport, owners, cache,
    context: cureContext(source, cache)};
}

export {requestHandoff, replaceConsumerContext, nativeCureFixture,
  refreshCureProjection, cureContext};
