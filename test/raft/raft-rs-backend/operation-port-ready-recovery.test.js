import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {applyCommittedEntryTransaction} from
  '../../../src/raft/raft-rs-application-transaction-owner.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {coreTrappingAppend} from './core-trap-envelope.js';

const HOST_FAILURE = 'HOST_FAILURE';
const CORE_FATAL = 'CORE_FATAL';
const CORE_OK = 'CORE_OK';

function elect(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
    'the real group elects before its host is faulted');
  return cluster.leaderReplicaId();
}

function lifecycleState(replica) {
  return replica.db.prepare(
    'SELECT state FROM _raft_rs_replica_lifecycle WHERE group_id = ?',
  ).pluck().get(replica.request.groupId);
}

function appliedIndex(replica) {
  return String(replica.db.prepare(
    'SELECT applied_index FROM _raft_rs_applied_state WHERE group_id = ?',
  ).pluck().get(replica.request.groupId));
}

function faultableDatabase(database, fault) {
  return new Proxy(database, {
    get(target, property) {
      if (property === 'transaction') {
        return (work) => {
          const transaction = target.transaction(work);
          return (...args) => {
            if (fault.failNextTransaction) {
              fault.failNextTransaction = false;
              throw new Error('injected SQLite transaction failure');
            }
            return transaction(...args);
          };
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('Ready snapshot entries and hard state share one SQLite commit point',
  () => {
    const ready = {
      snapshot: {
        data: Buffer.from('snapshot').toString('base64'),
        metadata: {
          index: '1',
          term: '1',
          confState: {
            voters: ['1'], learners: [], votersOutgoing: [],
            learnersNext: [], autoLeave: false,
          },
        },
      },
      entries: [{
        index: '1', term: '1', entryType: 0,
        data: Buffer.from('entry').toString('base64'),
      }],
      hardState: {term: '1', vote: '1', commit: '1'},
    };
    for (const table of [
      '_raft_rs_snapshot', '_raft_rs_log', '_raft_rs_hard_state',
    ]) {
      const database = new Database(':memory:');
      try {
        const store = new RaftRsDurableStore(database);
        database.exec(`
          CREATE TRIGGER fail_ready_write
          BEFORE INSERT ON ${table}
          BEGIN SELECT RAISE(ABORT, 'injected Ready write failure'); END
        `);
        assert.throws(() => store.persistReady('atomic-ready', ready),
          /injected Ready write failure/u);
        for (const durableTable of [
          '_raft_rs_snapshot', '_raft_rs_log', '_raft_rs_hard_state',
        ]) {
          assert.equal(database.prepare(
            `SELECT COUNT(*) FROM ${durableTable}`,
          ).pluck().get(), 0,
          `${table} failure rolls back ${durableTable}`);
        }
      } finally {
        database.close();
      }
    }
  });

// Epic finding F15: a failed delivery to one peer - its address cannot be
// resolved, the send throws, or no handler takes it - is that peer's
// transport outcome, never a host failure of the group. The Ready keeps its
// persistence and application, the leader keeps its role, and the shared
// runtime is not reconstructed.
test('every Ready delivery failure is a per-peer outcome and never reconstructs the group',
  async () => {
    const transportFault = {phase: null, armed: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'ready-delivery-failure-per-peer',
      replicaIds: ['ready-a', 'ready-b', 'ready-c'],
      resolveFor: (_from, to) => {
        if (transportFault.armed && transportFault.phase ===
            'address-resolution') {
          transportFault.armed = false;
          throw new Error('injected address-resolution failure');
        }
        return cluster.addressOf(to);
      },
      sendFor: () => {
        if (transportFault.armed && transportFault.phase === 'send') {
          transportFault.armed = false;
          throw new Error('injected send failure');
        }
        if (transportFault.armed && transportFault.phase ===
            'send-no-handler') {
          transportFault.armed = false;
          return {acknowledged: false, noHandler: true};
        }
        return undefined;
      },
    });
    try {
      const leader = elect(cluster);
      for (const phase of [
        'send', 'send-no-handler', 'address-resolution',
      ]) {
        const before = cluster.node(leader).readStatus();
        transportFault.phase = phase;
        transportFault.armed = true;
        const outcomes = [await cluster.propose(leader,
          `force-${phase}-delivery`)];
        for (let index = 0; index < 12 && transportFault.armed; index += 1) {
          outcomes.push(await cluster.tick(leader));
        }
        assert.equal(transportFault.armed, false,
          `the ${phase} fault was reached by a real Ready delivery`);
        assert.deepEqual(outcomes.filter((result) =>
          result?.outcome === HOST_FAILURE), [],
        `${phase} is never a host result of the group`);
        assert.equal(lifecycleState(cluster.replica(leader)), 'active');
        const after = await cluster.node(leader).readStatus();
        assert.equal(after.outcome, CORE_OK);
        assert.equal(after.runtimeGeneration, before.runtimeGeneration,
          `${phase} never replaces the runtime generation`);
        assert.equal(after.role, 'leader', `${phase} keeps the leader`);
        assert.equal(after.runtimeHealth, 'healthy');
        assert.equal(after.groupHealth, 'usable');
        assert.ok(after.peers.some((peer) =>
          peer.delivery.outcome === 'failed' && peer.delivery.phase === phase),
        `the failed peer carries the ${phase} delivery outcome`);
      }
    } finally {
      cluster.dispose();
    }
  });

test('application effects and durable applied progress commit atomically',
  async () => {
    const atomicDatabase = new Database(':memory:');
    try {
      const atomicStore = new RaftRsDurableStore(atomicDatabase);
      atomicDatabase.exec(
        'CREATE TABLE application_effects (value TEXT NOT NULL); ' +
        'CREATE TRIGGER fail_applied_progress ' +
        'BEFORE INSERT ON _raft_rs_applied_state ' +
        'BEGIN SELECT RAISE(ABORT, \'applied progress failed\'); END',
      );
      assert.throws(() => applyCommittedEntryTransaction({
        store: atomicStore,
        groupId: 'atomic-application',
        entry: {
          index: '1',
          entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
          data: Buffer.from('application-effect').toString('base64'),
        },
        confState: {
          voters: ['1'], learners: [], votersOutgoing: [],
          learnersNext: [], autoLeave: false,
        },
        applyCommittedEntry: (bytes) => atomicDatabase.prepare(
          'INSERT INTO application_effects (value) VALUES (?)',
        ).run(bytes.toString()),
      }), /applied progress failed/u);
      assert.equal(atomicDatabase.prepare(
        'SELECT COUNT(*) FROM application_effects',
      ).pluck().get(), 0,
      'an applied-progress failure rolls back application SQL effects');
    } finally {
      atomicDatabase.close();
    }

    const applicationFault = {armed: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'ready-application-atomicity',
      replicaIds: ['application-replica'],
      applyFor: () => {
        if (applicationFault.armed) {
          applicationFault.armed = false;
          throw new Error('injected application callback failure');
        }
      },
    });
    try {
      assert.equal(cluster.node('application-replica').campaign().outcome,
        CORE_OK);
      const replica = cluster.replica('application-replica');
      const beforeApplied = appliedIndex(replica);
      const generationBefore = cluster.node('application-replica')
        .readStatus().runtimeGeneration;
      applicationFault.armed = true;
      const failed = await cluster.propose(
        'application-replica', 'apply-exactly-once');
      assert.equal(failed.outcome, HOST_FAILURE);
      assert.equal(failed.phase, 'application');
      assert.equal(replica.appliedCommands.length, 0,
        'the failed transaction exposes no application effect');
      assert.equal(appliedIndex(replica), beforeApplied,
        'the durable applied watermark rolled back with the effect');
      const resumed = await cluster.tick('application-replica');
      assert.equal(resumed.outcome, CORE_OK);
      assert.equal(replica.appliedCommands.length, 1,
        'reconstruction replays the unapplied command once');
      assert.ok(BigInt(appliedIndex(replica)) > BigInt(beforeApplied));
      const generationAfter = cluster.node('application-replica')
        .readStatus().runtimeGeneration;
      // An application failure is a host failure of this group: the group
      // is reconstructed alone, in the current core (only a core failure
      // replaces the shared runtime).
      assert.equal(generationAfter, generationBefore,
        'replay occurs in the group reconstructed in the current core');
      assert.equal(lifecycleState(replica), 'active');
    } finally {
      cluster.dispose();
    }
  });

test('an async committed membership applier cannot advance durable progress',
  () => {
    const db = new Database(':memory:');
    try {
      const store = new RaftRsDurableStore(db);
      assert.throws(() => applyCommittedEntryTransaction({store,
        groupId: 'async-membership-applier', entry: {index: '1', term: '1',
          entryType: RAFT_RS_ENTRY_TYPE.CONF_CHANGE, data: ''},
        confState: {voters: ['1'], learners: [], votersOutgoing: [],
          learnersNext: [], autoLeave: false}, membershipGenerationIndex: '1',
        committedMembershipContext: {replicaIdentity: 'learner', peerId: '2'},
        applyCommittedMembershipContext: async () => undefined,
      }), /must complete inside its SQLite transaction/u);
      assert.equal(store.readDurableRecord('async-membership-applier')
        .appliedIndex, '0');
    } finally {
      db.close();
    }
  });

test('runtime replacement cannot re-enter a Ready generation suspended in host delivery',
  async () => {
    let releaseDelivery = null;
    let suspendDelivery = false;
    const cluster = new PartitionNodeCluster({
      partitionId: 'ready-epoch-fence',
      replicaIds: ['epoch-a', 'epoch-b', 'epoch-c'],
      sendFor: () => {
        if (!suspendDelivery) {
          return undefined;
        }
        suspendDelivery = false;
        return new Promise((resolve) => {
          releaseDelivery = resolve;
        });
      },
    });
    try {
      const leader = elect(cluster);
      const victim = ['epoch-a', 'epoch-b', 'epoch-c']
        .find((replicaId) => replicaId !== leader);
      const leaderPeerId = cluster.raftPeerIdOf(leader);
      await cluster.propose(leader, 'suspend-ready');
      suspendDelivery = true;
      let pendingReady = null;
      for (let index = 0; index < 12 && releaseDelivery === null; index += 1) {
        const result = cluster.tick(leader);
        if (result && typeof result.then === 'function') {
          pendingReady = result;
        }
      }
      assert.equal(typeof releaseDelivery, 'function',
        'the leader is suspended in a real Ready delivery await');
      const victimStatus = cluster.node(victim).readStatus();
      const originalConsoleError = console.error;
      let fatal;
      try {
        console.error = () => undefined;
        const accepted = await cluster.node(victim).step(coreTrappingAppend({
          dbFile: cluster.replica(victim).dbFile,
          groupId: cluster.partitionId,
          status: victimStatus,
          from: leaderPeerId,
          term: String(victimStatus.term),
        }));
        assert.equal(accepted.reason, 'inbound-enqueued');
        fatal = await cluster.node(victim).tick();
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(fatal.outcome, CORE_FATAL);
      const replaced = await cluster.node(victim).readStatus();
      const entriesAfterReplacement = cluster.coreEntryCount();
      releaseDelivery({acknowledged: true});
      const staleContinuation = await pendingReady;
      assert.equal(staleContinuation.outcome, HOST_FAILURE);
      assert.equal(staleContinuation.phase, 'runtime-generation-changed');
      assert.equal(cluster.coreEntryCount(), entriesAfterReplacement,
        'the old Ready continuation makes no call into reconstructed handles');
      assert.equal(replaced.runtimeHealth, 'healthy');
    } finally {
      cluster.dispose();
    }
  });

test('runtime traps and temporary host unavailability preserve logical identity',
  async () => {
    const databaseFault = {failNextTransaction: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'runtime-and-storage-identity',
      replicaIds: ['identity-replica'],
      wrapDatabase: (_replicaId, database) =>
        faultableDatabase(database, databaseFault),
    });
    try {
      const port = cluster.node('identity-replica');
      const initial = port.readStatus();
      databaseFault.failNextTransaction = true;
      const unavailable = await port.campaign();
      assert.equal(unavailable.outcome, HOST_FAILURE);
      assert.equal(unavailable.phase, 'ready-persistence');
      assert.equal(lifecycleState(cluster.replica('identity-replica')), 'active');
      const afterStorage = await port.readStatus();
      assert.equal(afterStorage.peerId, initial.peerId);
      assert.equal(afterStorage.replicaIdentity, initial.replicaIdentity);
      assert.equal(afterStorage.runtimeHealth, 'healthy');
      assert.equal(afterStorage.runtimeGeneration, initial.runtimeGeneration,
        'a storage failure reconstructs the group in the current core');
    } finally {
      cluster.dispose();
    }

    const trappedCluster = new PartitionNodeCluster({
      partitionId: 'runtime-trap-identity',
      replicaIds: ['trap-a', 'trap-b', 'trap-c'],
    });
    try {
      const leader = elect(trappedCluster);
      const victim = ['trap-a', 'trap-b', 'trap-c']
        .find((replicaId) => replicaId !== leader);
      const before = trappedCluster.node(victim).readStatus();
      const originalConsoleError = console.error;
      let trapped;
      try {
        console.error = () => undefined;
        const accepted = await trappedCluster.node(victim).step(
          coreTrappingAppend({
            dbFile: trappedCluster.replica(victim).dbFile,
            groupId: trappedCluster.partitionId,
            status: before,
            from: trappedCluster.raftPeerIdOf(leader),
            term: String(before.term),
          }));
        assert.equal(accepted.reason, 'inbound-enqueued');
        trapped = await trappedCluster.node(victim).tick();
      } finally {
        console.error = originalConsoleError;
      }
      assert.equal(trapped.outcome, CORE_FATAL);
      assert.equal(lifecycleState(trappedCluster.replica(victim)), 'active');
      const restored = await trappedCluster.node(victim).readStatus();
      assert.equal(restored.peerId, before.peerId);
      assert.equal(restored.replicaIdentity, before.replicaIdentity);
      assert.equal(restored.runtimeHealth, 'healthy');
      assert.ok(restored.runtimeGeneration > before.runtimeGeneration);
    } finally {
      trappedCluster.dispose();
    }
  });

// A group whose host failed keeps its node in the current core (only a core
// failure discards the core), so closing it frees that node once: the node's
// lifetime ends with its group (R13). Freeing drops the node with whatever
// Ready it held; nothing else of the node is entered.
test('closing a recovery-required group frees its node exactly once',
  async () => {
    const databaseFault = {failNextTransaction: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'close-stale-ready-generation',
      replicaIds: ['close-replica'],
      wrapDatabase: (_replicaId, database) =>
        faultableDatabase(database, databaseFault),
    });
    try {
      const port = cluster.node('close-replica');
      databaseFault.failNextTransaction = true;
      const failed = await port.campaign();
      assert.equal(failed.outcome, HOST_FAILURE);
      assert.equal(failed.recoveryRequired, true);
      const entriesBeforeClose = cluster.coreEntryCount();
      const closed = port.close();
      assert.equal(closed.outcome, CORE_OK);
      assert.equal(closed.reason, 'closed',
        'closing the failed group frees its node');
      assert.equal(cluster.coreEntryCount(), entriesBeforeClose + 1,
        'close frees the failed group\'s node (one core entry) and ' +
        'enters nothing else');
    } finally {
      cluster.dispose();
    }
  });
