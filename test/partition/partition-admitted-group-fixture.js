// A multi-replica partition group of real PartitionService replicas formed
// the way production forms one: a lone replica leads its single-voter group,
// then each further replica, named by a committed replica operation, asks
// the leader to admit it (ADMIT_REPLICA over the shared transport, answered
// from the committed operation; quest replica-admission-from-committed-
// operation), and starts its deferred election. Services rows are discovery
// only: they let a joiner find its leader, they never admit it.
//
// Each replica has its own database file and its own services cache; the
// replicas share one loopback transport. Nothing here chooses a leader or a
// configuration: every observation a caller makes is the core's (readStatus)
// or the durable record's.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {createLoopbackTransport} from './partition-service-test-support.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {committedStampOfAnswer} from
  '../../src/raft/raft-committed-membership-stamp.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {answerCommittedOperations, committedAddOperation} from
  './committed-operation-gateway-fixture.js';

const POLL_MS = 10;

/**
 * Form an admitted group.
 * @param {Object} options - {partitionId, members ([replicaId, nodeId]
 *   pairs, the first leads), tempPrefix, serviceOptions (PartitionService
 *   options shared by every replica: table, schema...), budgetMs, transport
 *   (optional caller-owned transport)}.
 * @return {Promise<Object>} {services, dbFileOf, addressOf, waitFor,
 *   dispose}; `services[i]` is `members[i]`'s replica.
 */
async function formAdmittedGroup({partitionId, members, tempPrefix,
  serviceOptions, budgetMs, transport = null}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
  const dbFileOf = ([replicaId]) => path.join(directory, `${replicaId}.db`);
  const addressOf = ([replicaId, nodeId]) =>
    `${nodeId}/partition/${replicaId}`;
  const serviceRow = ([replicaId, nodeId]) => ({
    service_id: replicaId, replica_id: replicaId, partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION, node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
  });
  const network = transport ?? createLoopbackTransport();
  const ownsTransport = transport === null;
  const services = [];
  const caches = [];
  const operations = members.slice(1).map((member) =>
    committedAddOperation(partitionId, member));
  const waitFor = async (predicate) => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      if (await predicate()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return false;
  };
  const dispose = async ({retainDirectory = false} = {}) => {
    if (ownsTransport) network.deliver = async () => undefined;
    const settled = await Promise.allSettled(services.map((service) =>
      service.shutdown()));
    const failures = settled.flatMap((answer, index) =>
      answer.status === 'rejected' ?
        [Object.freeze({replicaId: services[index].replicaId,
          error: answer.reason})] : []);
    if (failures.length > 0) {
      const aggregate = new AggregateError(failures.map(({error}) => error),
        `group shutdown failed; retained temporary directory ${directory}`);
      aggregate.shutdownFailures = failures;
      aggregate.retainedDirectory = directory;
      throw aggregate;
    }
    if (!retainDirectory) fs.rmSync(directory, {recursive: true, force: true});
  };
  const build = (member, visible, extra = {}) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT,
      {partition_id: partitionId, replica_count: members.length});
    for (const row of visible) {
      cache.applySystemTableChange(
        TABLES.SERVICES, CDCOperation.INSERT, serviceRow(row));
    }
    const service = new PartitionService(withFoundingStamp({
      ...serviceOptions,
      partitionId,
      replicaId: member[0],
      replicaIds: visible.map(([replicaId]) => replicaId),
      peerAddresses: visible.map(addressOf),
      nodeId: member[1],
      dbPath: dbFileOf(member),
      transport: network,
      systemTableCache: cache,
      ...extra,
    }));
    answerCommittedOperations(service, operations);
    services.push(service);
    caches.push(cache);
    return service;
  };
  try {
    const leader = build(members[0], [members[0]]);
    await leader.initialize();
    assert.equal(await waitFor(() =>
      leader.raft.readStatus().role === RAFT_ROLE.LEADER), true,
    'setup: the first replica leads');
    for (let joined = 1; joined < members.length; joined += 1) {
      // The joiner is created the way a CREATE target is: from the
      // committed-membership stamp its group leader served (the creation
      // owner's bootstrap read); the stamp names that leader.
      const stamp = committedStampOfAnswer(await leader.raft.readCommittedMembership({
        purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}));
      assert.ok(stamp, 'setup: the leader serves a committed-membership stamp');
      const replica = build(members[joined], members.slice(0, joined + 1),
        {deferElection: true, bootstrapMembership: stamp});
      await replica.initialize();
      for (const cache of caches.slice(0, joined)) {
        cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
          serviceRow(members[joined]));
      }
      // It asks the leader its stamp names to admit it.
      const request = await replica.requestReplicaAdmission(
        operations[joined - 1].operation_id);
      assert.equal(
        ['in_flight', 'proposed', 'already_member'].includes(request.lastOutcome),
        true,
        `setup: the leader accepts ${members[joined][0]} from its committed ` +
        `operation (${request.lastOutcome})`);
      replica.startElection();
      assert.equal(await waitFor(() => {
        const status = leader.raft.readStatus();
        return status.followerProgress[members[joined][0]] ===
          status.commitIndex;
      }), true, `setup: replica ${members[joined][0]} is admitted`);
      await replica.driveReplicaAdmission();
      assert.equal(request.state, 'admitted',
        `setup: the leader admits ${members[joined][0]} from its committed ` +
        `operation (${request.lastOutcome})`);
    }
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      const aggregate = new AggregateError([error, cleanupError], error.message,
        {cause: error});
      aggregate.cleanupFailure = cleanupError;
      aggregate.retainedDirectory = cleanupError.retainedDirectory ?? directory;
      throw aggregate;
    }
    throw error;
  }
  return {services, dbFileOf, addressOf, waitFor, dispose};
}

export {formAdmittedGroup};
