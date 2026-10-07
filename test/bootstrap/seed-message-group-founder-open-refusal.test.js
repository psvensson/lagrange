// The open-time rule for a seed MESSAGE-GROUP founder, driven through the
// real seed-message-groups phase (createBootstrapMessageGroupReplica ->
// seedReplicaIdentityExisted -> MessageGroupService -> the rs-raft port on
// the real WASM core). A first boot (empty startup admission) founds the
// group; a founder whose services row the seed's startup admission holds,
// reopened on a lost database, is refused reseed-required at open and held
// durably (its lifecycle row says so), never re-founded empty.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {SeedMessageGroupsPhase} from
  '../../src/bootstrap/phases/seed-message-groups-phase.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';

const NODE_ID = 'seed-1';
const GROUP_ID = 'mg-1';
const REPLICA_ID = 'mg-1-r0';
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const FOUNDER = Object.freeze({groupId: GROUP_ID, replicaId: REPLICA_ID,
  replicaIds: [REPLICA_ID], deferElection: true, replicaIndex: 0,
  peerAddresses: [`${NODE_ID}/message-group/${REPLICA_ID}`]});

// The router surface the message-group service requires; nothing is
// delivered in this witness.
const ROUTER = Object.freeze({
  initialize() {},
  setServiceNodeResolver() {},
  register() {},
  unregister() {},
  getRegisteredHandler: () => null,
  unregisterExact: () => true,
  deliver: async () => ({acknowledged: true}),
});

function seedPhase(directory, services, admission) {
  return new SeedMessageGroupsPhase({delegates: {
    getLogger: () => QUIET,
    getMessageGroupServices: () => services,
    sleep: async () => {},
    getNodeId: () => NODE_ID,
    getMessageRouter: () => ROUTER,
    resolveMessageGroupDbPath: (groupId, replicaId) =>
      path.join(directory, `${groupId}-${replicaId}.db`),
    getStartupServicesAdmission: () => admission,
    getReplicaStateMachine: () => null,
    pushMessageGroupReplica() {},
    incrementServicesCreated() {},
  }});
}

function lifecycleRow(dbFile) {
  const db = new Database(dbFile, {readonly: true});
  try {
    return {...db.prepare('SELECT state, reason FROM ' +
      '_raft_rs_replica_lifecycle WHERE group_id = ?').get(GROUP_ID)};
  } finally {
    db.close();
  }
}

test('a seed message-group founder whose services row survives its lost ' +
  'database is refused reseed-required at open, through the seed phase',
async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-mg-open-'));
  const dbFile = path.join(directory, `${GROUP_ID}-${REPLICA_ID}.db`);
  const services = new Map();
  try {
    const first = await seedPhase(directory, services,
      {empty: true, rows: []}).createBootstrapMessageGroupReplica(
      {replicaOptions: FOUNDER});
    assert.equal(first.status, 'created', 'a first boot founds the group');
    await services.get(REPLICA_ID).shutdown();
    services.clear();
    fs.rmSync(dbFile, {force: true});
    const row = {service_id: REPLICA_ID, node_id: NODE_ID,
      service_type: 'message_group', status: 'stopped'};
    await assert.rejects(seedPhase(directory, services,
      {empty: false, rows: [row]}).createBootstrapMessageGroupReplica(
      {replicaOptions: FOUNDER}), (error) => {
      assert.equal(error.consensus?.reason,
        COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
      assert.equal(error.consensus?.retryable, false);
      return true;
    });
    assert.equal(services.has(REPLICA_ID), false, 'a held founder is mapped');
    assert.deepEqual(lifecycleRow(dbFile), {state: 'retired',
      reason: COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED});
  } finally {
    for (const service of services.values()) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
