// A multi-replica partition group of real PartitionService replicas formed
// the way production forms one: a lone replica leads its single-voter group,
// then each further replica is admitted by the leader's services-cache
// reconcile when its ACTIVE services row becomes visible (the admission owner
// proposes the configuration change), and starts its deferred election.
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

const POLL_MS = 10;

/**
 * Form an admitted group.
 * @param {Object} options - {partitionId, members ([replicaId, nodeId]
 *   pairs, the first leads), tempPrefix, serviceOptions (PartitionService
 *   options shared by every replica: table, schema...), budgetMs}.
 * @return {Promise<Object>} {services, dbFileOf, addressOf, waitFor,
 *   dispose}; `services[i]` is `members[i]`'s replica.
 */
async function formAdmittedGroup({partitionId, members, tempPrefix,
  serviceOptions, budgetMs}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
  const dbFileOf = ([replicaId]) => path.join(directory, `${replicaId}.db`);
  const addressOf = ([replicaId, nodeId]) =>
    `${nodeId}/partition/${replicaId}`;
  const serviceRow = ([replicaId, nodeId]) => ({
    service_id: replicaId, replica_id: replicaId, partition_id: partitionId,
    service_type: SERVICE_TYPE.PARTITION, node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
  });
  const network = createLoopbackTransport();
  const services = [];
  const caches = [];
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
  const dispose = async () => {
    network.deliver = async () => undefined;
    await Promise.all(services.map((service) => service.shutdown()));
    fs.rmSync(directory, {recursive: true, force: true});
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
      const replica = build(members[joined], members.slice(0, joined + 1),
        {deferElection: true});
      await replica.initialize();
      for (const cache of caches.slice(0, joined)) {
        cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT,
          serviceRow(members[joined]));
      }
      replica.startElection();
      assert.equal(await waitFor(() => {
        const status = leader.raft.readStatus();
        return status.followerProgress[addressOf(members[joined])] ===
          status.commitIndex;
      }), true, `setup: replica ${members[joined][0]} is admitted`);
    }
  } catch (error) {
    await dispose();
    throw error;
  }
  return {services, dbFileOf, addressOf, waitFor, dispose};
}

export {formAdmittedGroup};
