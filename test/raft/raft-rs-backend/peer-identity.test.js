// Receipt: peer-identity-is-stable-address-independent-unreused-and-exact
//
// §10 of the binding direction makes stable peer identity a Lagrange
// obligation, because raft-rs does not prevent logical peer-id reuse. Five
// properties are measured here, none of them against a literal this file
// owns:
//
//   stable across process restart - the registry is reopened from its file;
//   independent of address        - derived structurally from the module;
//   never list position           - the same identities registered in the
//                                   opposite order, in a different database,
//                                   produce the same ids, with the existing
//                                   position-allocating mapper as the control
//                                   that shows the check discriminates;
//   never reassigned after retirement - the retired set is a durable row, and
//                                   the refusal survives closing and
//                                   reopening the database. Phase 0's
//                                   in-memory set was called a tautology by a
//                                   verifier, and this is what answers that;
//   exact across the boundary     - the id the core reports for itself is
//                                   the registry's decimal string, character
//                                   for character, while the same value
//                                   through a JavaScript Number is not.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {
  buildDeterministicRaftIdMaps,
} from '../../../src/raft/raft-id-mapper.js';
import {
  RAFT_RS_PEER_IDENTITY_ERROR_MSG,
} from '../../../src/raft/raft-rs-peer-identity-constants.js';
import {
  RaftRsPeerIdentityRegistry,
} from '../../../src/raft/raft-rs-peer-identity.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..', '..', '..');
const IDENTITY_MODULE = 'src/raft/raft-rs-peer-identity.js';
const CONTROL_MODULE = 'src/raft/liferaft-provider.js';
const ADDRESSY = /\b(address|host|port|endpoint|url)\b/iu;
const NUMBER_COERCION = /\b(Number|parseInt|parseFloat)\s*\(/u;
const TEMP_PREFIX = 'raft-rs-peer-identity-';
const GROUP_ID = 'partition-identity';
const SETTLE_ROUNDS = 200;
const UTF8 = 'utf8';

// Lagrange replica identities, in the shape the partition service uses.
const REPLICAS = Object.freeze([
  'partition-7/replica-a',
  'partition-7/replica-b',
  'partition-7/replica-c',
]);
const RETIRED_REPLICA = REPLICAS[2];
const REPLACEMENT_REPLICA = 'partition-7/replica-d';

function scratchDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
}

function openRegistry(file) {
  const db = new Database(file);
  return {db, registry: new RaftRsPeerIdentityRegistry(db)};
}

function registerAll(registry, replicas) {
  return replicas.map((replica) => registry.registerReplica(replica));
}

function sourceOf(relative) {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, relative), UTF8);
}

test('a raft peer id survives restart, ignores address and is never reassigned',
  async () => {
    const directory = scratchDirectory();
    const registryFile = path.join(directory, 'identity.sqlite');
    const reversedFile = path.join(directory, 'identity-reversed.sqlite');
    let opened = openRegistry(registryFile);
    try {
      // ---- exact across the JS boundary -----------------------------------
      const ids = registerAll(opened.registry, REPLICAS);
      assert.equal(new Set(ids).size, REPLICAS.length);
      for (const id of ids) {
        assert.equal(typeof id, 'string');
        assert.equal(String(BigInt(id)), id, 'the id is an exact integer');
        assert.ok(BigInt(id) > 0n, 'raft-rs treats 0 as no peer at all');
        assert.ok(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER),
          'an id a JavaScript Number can hold exactly would not measure the ' +
          'boundary the receipt is about');
        assert.notEqual(String(Number(id)), id,
          'the same value through a Number is a different value: that is ' +
          'what the decimal-string boundary exists to prevent');
      }
      // The module itself cannot round one: nothing on its path coerces.
      assert.ok(!NUMBER_COERCION.test(sourceOf(IDENTITY_MODULE)),
        'a Number() anywhere on the identity path would round a u64');
      assert.ok(NUMBER_COERCION.test(sourceOf('src/raft/raft-rs-provider.js')),
        'control: the same search does find the provider\'s own Number(), ' +
        'the u64 narrowing phase 1 recorded as a debt');

      // ---- independent of address -----------------------------------------
      assert.ok(!ADDRESSY.test(sourceOf(IDENTITY_MODULE)),
        'an address anywhere in the identity owner would make identity ' +
        'follow placement');
      assert.ok(ADDRESSY.test(sourceOf(CONTROL_MODULE)),
        'control: the same search finds addresses where they are');

      // ---- stable across process restart ----------------------------------
      opened.db.close();
      opened = openRegistry(registryFile);
      assert.deepEqual(registerAll(opened.registry, REPLICAS), ids,
        'reopening the registry from its file returns the same ids');
      for (const [index, replica] of REPLICAS.entries()) {
        assert.equal(opened.registry.raftPeerIdOf(replica), ids[index]);
        assert.equal(opened.registry.replicaIdentityOf(ids[index]), replica);
      }

      // ---- never list position --------------------------------------------
      const reversed = openRegistry(reversedFile);
      const reversedIds = registerAll(
        reversed.registry, [...REPLICAS].reverse());
      reversed.db.close();
      assert.deepEqual([...reversedIds].reverse(), ids,
        'a different registration order in a different database gives the ' +
        'same identity, so position cannot be what decides it');
      // The control: the mapper this does NOT reuse allocates by position,
      // so the same two orders disagree there. Without this the check above
      // could pass on a mapping that happens not to vary.
      const forward = buildDeterministicRaftIdMaps([...REPLICAS]);
      const backward = buildDeterministicRaftIdMaps([...REPLICAS].reverse());
      assert.notEqual(
        forward.externalToInternal.get(REPLICAS[0]),
        backward.externalToInternal.get(REPLICAS[0]),
        'control: the position-allocating mapper does move an id when the ' +
        'list order changes');

      // ---- never reassigned after retirement ------------------------------
      const retiredId = opened.registry.raftPeerIdOf(RETIRED_REPLICA);
      opened.registry.retireReplica(RETIRED_REPLICA);
      assert.throws(() => opened.registry.registerReplica(RETIRED_REPLICA),
        (error) => error.message.includes(RETIRED_REPLICA) &&
          error.message.includes(retiredId));
      // A replacement replica is a different logical replica and gets a
      // different id; the retired one is still reserved to its owner.
      const replacementId = opened.registry.registerReplica(
        REPLACEMENT_REPLICA);
      assert.notEqual(replacementId, retiredId);
      // The retired set survives the restart of whatever owns the mapping:
      // it is a row, read back through an independent connection.
      opened.db.close();
      const independent = new Database(registryFile, {readonly: true});
      const reservations = independent.prepare(
        'SELECT replica_identity, raft_peer_id, retired FROM ' +
        'raft_rs_peer_identity ORDER BY raft_peer_id').all();
      independent.close();
      assert.equal(
        reservations.filter((row) => row.retired === 1).length, 1);
      assert.equal(
        reservations.find((row) => row.retired === 1).raft_peer_id, retiredId);
      opened = openRegistry(registryFile);
      assert.throws(() => opened.registry.registerReplica(RETIRED_REPLICA),
        (error) => error.message.includes(
          RAFT_RS_PEER_IDENTITY_ERROR_MSG.retired(
            RETIRED_REPLICA, retiredId)));
      assert.equal(opened.registry.replicaIdentityOf(retiredId),
        RETIRED_REPLICA,
        'a retired id still resolves to the replica that owned it, which is ' +
        'what stops it being handed to another one');

      // ---- driven through a real cluster ----------------------------------
      const cluster = new DeterministicRaftRsCluster({
        voters: ids, groupId: GROUP_ID,
      });
      try {
        assert.ok(cluster.campaign(ids[0]));
        assert.ok(cluster.settle((current) => current.leaderId() === ids[0],
          {rounds: SETTLE_ROUNDS}));
        for (const [index, replica] of REPLICAS.entries()) {
          assert.equal(cluster.status(ids[index]).id, ids[index],
            'the core reports the registry\'s decimal string for itself');
          assert.equal(opened.registry.replicaIdentityOf(
            cluster.status(ids[index]).id), replica);
        }
        assert.deepEqual(cluster.confState(ids[0]).voters.slice().sort(),
          [...ids].sort(),
          'the committed configuration is made of the registry\'s ids');
        // A restart of one peer changes nothing about who it is.
        cluster.crash(ids[1]);
        cluster.restart(ids[1]);
        assert.equal(cluster.status(ids[1]).id, ids[1],
          'a restarted replica is the same logical peer, and its own ' +
          'durable record is where that comes from');
        assert.ok(cluster.settle(
          (current) => current.status(ids[1]).lead === ids[0],
          {rounds: SETTLE_ROUNDS, tickOnly: [ids[0]]}),
        'the restarted peer rejoins under the identity it had');
      } finally {
        cluster.dispose();
      }
    } finally {
      opened.db.close();
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
