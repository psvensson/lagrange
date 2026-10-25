// The open-time rule for a seed MESSAGE-GROUP founder, driven through the
// real seed-message-groups phase (createBootstrapMessageGroupReplica ->
// the original seed attempt's replica admission -> MessageGroupService -> the
// rs-raft port on the real WASM core). The phase and its delegates are the
// bootstrap owner's own, over a seed that entered the original attempt the way
// production does. A first boot founds the group; a founder reopened on a lost
// database is refused reseed-required and held durably (its lifecycle row
// says so), never re-founded empty.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {ADDRESS, ENTITY_TYPE, SERVICE_TYPE} from '../../src/constants/index.js';
import {INITIAL_MESSAGE_GROUP_ID, INITIAL_MESSAGE_GROUP_REPLICA_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {getMessageGroupDbPath} from '../../src/storage/data-directory-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createPreparedVirginSeedBootstrapService,
  createRetainedSeedBootstrapService} from
  '../integration/helpers/cluster-test-helpers.js';

const NODE_ID = 'seed-1';
const NODE_ADDRESS = 'ws://127.0.0.1:18082';
const REPLICA_ID = INITIAL_MESSAGE_GROUP_REPLICA_IDS[0];
const FOUNDER = Object.freeze({serviceType: SERVICE_TYPE.MESSAGE_GROUP,
  groupId: INITIAL_MESSAGE_GROUP_ID,
  replicaId: REPLICA_ID, replicaIds: [...INITIAL_MESSAGE_GROUP_REPLICA_IDS],
  deferElection: true, replicaIndex: 0,
  peerAddresses: INITIAL_MESSAGE_GROUP_REPLICA_IDS.map((id) =>
    [NODE_ID, ENTITY_TYPE.MESSAGE_GROUP, id].join(ADDRESS.SEPARATOR))});

// One seed start: the production original attempt, the real router, and the
// bootstrap owner's own seed-message-groups phase. The reopen is the seed's
// later start on the directory the first start left behind.
function attachRouter(service) {
  service.messageRouter = new MessageRouter({nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS, bootIncarnation: service.bootIncarnation});
  service.transport = service.messageRouter;
  return service;
}

async function firstSeedStart(dataDir) {
  return attachRouter(await createPreparedVirginSeedBootstrapService({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, dataDir,
  }));
}

async function laterSeedStart(dataDir, retain) {
  const service = await createRetainedSeedBootstrapService({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, dataDir,
  });
  retain(service);
  await service.prepareOriginalSeedAttempt();
  return attachRouter(service);
}

function lifecycleRow(dbFile) {
  const db = new Database(dbFile, {readonly: true});
  try {
    return {...db.prepare('SELECT state, reason FROM ' +
      '_raft_rs_replica_lifecycle WHERE group_id = ?').get(INITIAL_MESSAGE_GROUP_ID)};
  } finally {
    db.close();
  }
}

test('a seed message-group founder reopened on its lost database is ' +
  'refused reseed-required at open, through the seed phase',
async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-mg-open-'));
  let reopened = null;
  // Shut the later start down (releasing its custody) before its directory
  // is removed.
  t.after(async () => {
    await reopened?.shutdown();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  const dbFile = getMessageGroupDbPath(dataDir, INITIAL_MESSAGE_GROUP_ID,
    REPLICA_ID);
  const first = await firstSeedStart(dataDir);
  try {
    const founded = await first.seedMessageGroupsPhase
      .createBootstrapMessageGroupReplica({replicaOptions: FOUNDER});
    assert.equal(founded.status, 'created', 'a first boot founds the group');
  } finally {
    await first.shutdown();
  }
  fs.rmSync(dbFile, {force: true});
  // Red by design today: the later start holds at
  // original-retained-history-classification-unavailable (owned by Quest
  // retained-seed-original-handoff) before this phase can reopen the founder.
  await assert.rejects(laterSeedStart(dataDir, (service) => {
    reopened = service;
  }).then((service) =>
    service.seedMessageGroupsPhase.createBootstrapMessageGroupReplica(
      {replicaOptions: FOUNDER})), (error) => {
    assert.equal(error.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED,
      `refused at open, not ${error.code}: ${error.reason ?? error.message}`);
    assert.equal(error.consensus?.retryable, false);
    return true;
  });
  // Unmeasured while the hold above stands: the phase never reaches open.
  assert.equal(reopened.messageGroupServices.has(REPLICA_ID), false,
    'a held founder is not mapped');
  assert.deepEqual(lifecycleRow(dbFile), {state: 'retired',
    reason: COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED});
});
