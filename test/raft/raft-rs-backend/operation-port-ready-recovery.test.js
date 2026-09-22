import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {applyCommittedEntryTransaction} from
  '../../../src/raft/raft-rs-application-transaction-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const TEXT = new TextEncoder();
const HOST_FAILURE = 'HOST_FAILURE';
const CORE_FATAL = 'CORE_FATAL';
const CORE_OK = 'CORE_OK';

function elect(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
    'the real group elects before its host is faulted');
  return cluster.leaderReplicaId();
}

async function tickUntilHostFailure(cluster, replicaId, attempts = 12) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await cluster.tick(replicaId);
    if (result?.outcome === HOST_FAILURE) {
      return result;
    }
  }
  return null;
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

test('every Ready host failure reconstructs the group before another core operation',
  async () => {
    const transportFault = {phase: null, armed: false};
    const cluster = new PartitionNodeCluster({
      partitionId: 'ready-host-failure-reconstruction',
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
      let leader = elect(cluster);
      for (const phase of [
        'send', 'send-no-handler', 'address-resolution',
      ]) {
        const identityBefore = cluster.raftPeerIdOf(leader);
        const generationBefore = cluster.node(leader).readStatus()
          .runtimeGeneration;
        transportFault.phase = phase;
        transportFault.armed = true;
        await cluster.propose(leader, TEXT.encode(`force-${phase}-delivery`));
        const failed = await tickUntilHostFailure(cluster, leader);
        assert.equal(failed?.outcome, HOST_FAILURE, `${phase} is a host result`);
        assert.equal(failed.phase, phase);
        assert.equal(failed.recoveryRequired, true);
        assert.equal(lifecycleState(cluster.replica(leader)), 'active');
        const recovered = await cluster.node(leader).readStatus();
        assert.equal(recovered.outcome, CORE_OK);
        assert.ok(recovered.runtimeGeneration > generationBefore,
          `${phase} replaces the generation before the next core operation`);
        assert.equal(recovered.peerId, identityBefore);
        assert.equal(recovered.runtimeHealth, 'healthy');
        assert.equal(recovered.groupHealth, 'usable');
        leader = elect(cluster);
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
        'application-replica', TEXT.encode('apply-exactly-once'));
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
      assert.ok(generationAfter > generationBefore,
        'replay occurs in a reconstructed execution generation');
      assert.equal(lifecycleState(replica), 'active');
    } finally {
      cluster.dispose();
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
      await cluster.propose(leader, TEXT.encode('suspend-ready'));
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
        const accepted = await cluster.node(victim).step({
          groupId: cluster.partitionId,
          to: victimStatus.peerId,
          message: {
            from: leaderPeerId,
            to: victimStatus.peerId,
            msgType: 8,
            term: String(victimStatus.term),
            logTerm: '0',
            index: '0',
            commit: '999999',
          },
        });
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
      assert.ok(afterStorage.runtimeGeneration > initial.runtimeGeneration);
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
        const accepted = await trappedCluster.node(victim).step({
          groupId: trappedCluster.partitionId,
          to: before.peerId,
          message: {
            from: trappedCluster.raftPeerIdOf(leader),
            to: before.peerId,
            msgType: 8,
            term: String(before.term),
            logTerm: '0',
            index: '0',
            commit: '999999',
          },
        });
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

test('closing a recovery-required group never enters its stale RawNode',
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
      assert.equal(closed.reason, 'closed-without-core-entry');
      assert.equal(cluster.coreEntryCount(), entriesBeforeClose,
        'close quarantines rather than frees the unadvanced RawNode');
    } finally {
      cluster.dispose();
    }
  });
