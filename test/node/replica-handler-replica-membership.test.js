// READ_REPLICA_MEMBERSHIP through a real ReplicaHandler on real partition
// services (quest replace-source-removal-owner, amendment-1 step 3, the
// witness seam's node end):
//   - the tracked target answers with its own port's committed voters (the
//     source is a VOTER), commit index and leader, and echoes the request's
//     attempt sequence;
//   - a replica the node does not track answers NOT_FOUND.
// Oracle: the replica's own raft.readStatus().

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

const TEMP_PREFIX = 'replica-handler-replica-membership-';
const TEST_TIMEOUT_MS = 60000;
const GROUP_BUDGET_MS = 10000;
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'replica-membership-node'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function tableOptions() {
  return {
    tableId: 'membership_rows',
    tableName: 'membership_rows',
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function readMembership(handler, {partitionId, replicaId, sourceReplicaId,
  attemptSeq}) {
  return handler.handleMessage({
    correlationId: `read-${replicaId}`,
    payload: {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP,
      [ReplicaOperationField.OPERATION_ID]: 'replace-membership-read',
      [ReplicaOperationField.PARTITION_ID]: partitionId,
      [ReplicaOperationField.REPLICA_ID]: replicaId,
      [ReplicaOperationField.SOURCE_REPLICA_ID]: sourceReplicaId,
      [ReplicaOperationField.ATTEMPT_SEQ]: attemptSeq,
    },
  });
}

test('READ_REPLICA_MEMBERSHIP: the tracked target answers from its own ' +
  'port; an untracked replica is NOT_FOUND', {timeout: TEST_TIMEOUT_MS},
async () => {
  quietEnvironment();
  const partitionId = 'membership-read';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const members = [1, 2, 3].map((ordinal) =>
    [`${partitionId}-r${ordinal}`, `node-${ordinal}`]);
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: TEMP_PREFIX, serviceOptions: tableOptions(),
    budgetMs: GROUP_BUDGET_MS});
  try {
    const [target, source] = group.services;
    const handler = new ReplicaHandler({
      nodeId: 'node-1',
      dataDir,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {},
      createPartitionService: async () => {
        throw new Error('this handler creates no replica');
      },
    });
    handler.localServices.set(target.replicaId, target);
    const response = await readMembership(handler, {partitionId,
      replicaId: target.replicaId, sourceReplicaId: source.replicaId,
      attemptSeq: 7});
    const status = target.raft.readStatus();
    assert.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
      JSON.stringify(response));
    assert.equal(response[ReplicaOperationField.ATTEMPT_SEQ], 7,
      'the attempt sequence is echoed');
    const membership = response[ReplicaOperationField.MEMBERSHIP];
    assert.equal(membership.state, PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER);
    assert.equal(membership.replicaId, target.replicaId);
    assert.equal(membership.leaderReplicaId, status.leaderId ?? null,
      'the leader is the target port\'s own');
    assert.ok(membership.commitIndex >= 0 &&
      membership.commitIndex <= target.raft.readStatus().commitIndex,
    'the commit index is the target port\'s own');
    const untracked = await readMembership(handler, {partitionId,
      replicaId: source.replicaId, sourceReplicaId: target.replicaId,
      attemptSeq: 8});
    assert.equal(untracked.status, ReplicaOperationResponseStatus.NOT_FOUND);
    assert.equal(untracked[ReplicaOperationField.ATTEMPT_SEQ], 8);
    handler.localServices.clear();
  } finally {
    await group.dispose();
    fs.rmSync(dataDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
