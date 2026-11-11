// A leader never commits a removal that leaves its group without a live
// quorum (2026-11-11, the REPLACE target-death hazard). Group {x, s, t}: the
// REPLACE target t dies, then the source s's REMOVING row reaches the leader
// x. Before, x proposed RemoveNode(s) from the row; s's acknowledgement
// committed it, the configuration became {x, t-dead} and x could never lead
// or commit again. The leader's conf-change admission now refuses a removal
// whose RESULTING voters are no live quorum by its own check-quorum activity
// (REMOVES_LIVE_QUORUM), and the legitimate case still passes: removing the
// dead voter from a group whose survivors are a live quorum.
//
// Real PartitionServices on rs-raft (partition-admitted-group-fixture.js),
// released by the real release owners; every observation is the core's
// status or a write's answer.

import assert from 'node:assert/strict';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {CDCOperation} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {recoveryRetryWindowMsOf} from '../../src/raft/raft-rs-runtime-tuning.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const TABLE_NAME = 'live_quorum_rows';
const TEST_TIMEOUT_MS = 120000;
const GROUP_BUDGET_MS = 15000;
const GROUP_TIMING = Object.freeze({heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300});
// Past the leader's liveness window (two election timeouts) and then some.
const DETECTION_WINDOWS = 4;

let writes = 0;
function insert(service) {
  writes += 1;
  const id = `row-${writes}`;
  return service.applyWrite({type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: `INSERT INTO ${TABLE_NAME} (id) VALUES (?)`, params: [id],
    entryId: id});
}

function retiringRow(partitionId, [replicaId, nodeId]) {
  return {service_id: replicaId, replica_id: replicaId,
    partition_id: partitionId, service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId, address: `${nodeId}/partition/${replicaId}`,
    status: ReplicaStatus.REMOVING};
}

async function deliverRow(service, row) {
  service.systemTableCache.applySystemTableChange(
    TABLES.SERVICES, CDCOperation.UPDATE, row);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('the target dies before the source\'s removal commits: the leader ' +
  'refuses it, the group keeps quorum and takes writes; removing the dead ' +
  'target instead succeeds', {timeout: TEST_TIMEOUT_MS}, async () => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'lq-node'},
    raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const partitionId = 'live-quorum';
  const members = [['live-quorum-x', 'node-x'], ['live-quorum-s', 'node-s'],
    ['live-quorum-t', 'node-t']];
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: 'partition-removal-live-quorum-',
    serviceOptions: {tableId: TABLE_NAME, tableName: TABLE_NAME,
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}},
    budgetMs: GROUP_BUDGET_MS});
  const [x, s, t] = group.services;
  let owners = null;
  try {
    owners = await attachPartitionReleaseOwners(group.services,
      {directory: path.dirname(group.dbFileOf(members[0])),
        budgetMs: GROUP_BUDGET_MS});
    await owners.release(partitionId);
    assert.equal((await insert(x)).success, true, 'setup: x takes a write');
    const sPeer = s.raft.readStatus().peerId;
    const tPeer = t.raft.readStatus().peerId;

    // t dies; the leader's activity record sees it go silent.
    await t.shutdown();
    await delay(DETECTION_WINDOWS * recoveryRetryWindowMsOf(x.raftTimingConfig));
    await deliverRow(x, retiringRow(partitionId, members[1]));
    await delay(DETECTION_WINDOWS * recoveryRetryWindowMsOf(x.raftTimingConfig));
    const afterSource = x.raft.readStatus();
    const sourceWrite = await insert(x);
    // The operation retained the source: its row serves again (the
    // cancellation's effect), and the deferred retirement is dropped.
    await deliverRow(x, {...retiringRow(partitionId, members[1]),
      status: ReplicaStatus.ACTIVE});

    // The legitimate removal: the dead target, survivors {x, s} live.
    await deliverRow(x, retiringRow(partitionId, members[2]));
    const deadRemoved = await group.waitFor(() =>
      !x.raft.readStatus().confState.voters.includes(tPeer));
    if (deadRemoved) await owners.release(partitionId);
    const afterDead = x.raft.readStatus();
    const deadWrite = deadRemoved ? await insert(x) : null;

    assert.deepEqual({
      sourceStillVoter: afterSource.confState.voters.includes(sPeer),
      leaderAfterSource: afterSource.role,
      sourceWrite: sourceWrite.success === true ? true : sourceWrite,
      deadRemoved,
      survivors: afterDead.confState.voters.length,
      deadWrite: deadWrite?.success === true ? true : deadWrite,
    }, {
      sourceStillVoter: true,
      leaderAfterSource: RAFT_ROLE.LEADER,
      sourceWrite: true,
      deadRemoved: true,
      survivors: 2,
      deadWrite: true,
    });
  } finally {
    await owners?.dispose();
    await group.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
