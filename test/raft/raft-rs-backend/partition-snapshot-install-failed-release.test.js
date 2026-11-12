// Native release custody and finite-failure continuation through real removal owners.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {TABLES} from '../../../src/constants/index.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {CADENCE_ENTRY_THRESHOLD, PARTITION_ID, cutOff, holdNextOpen,
  recreationOf, withInstallWorld, writeAndCompact, waitFor} from
  './snapshot-install-investigation-fixture.js';

test('a failed replacement release prevents episode cleanup from deleting its open database',
  {timeout: 180000}, async () => {
    await withInstallWorld({establishedOnTarget: true}, async (world) => {
      const {handler, third} = world;
      const replicaId = third.replicaId;
      assert.equal(third.dbPath, handler.getPartitionDbPath(PARTITION_ID, replicaId));
      // The original fixture seeds PARTITIONS only in caches. Removal's
      // leader-clear owner needs the authoritative row too.
      await world.store.gateway.insertSystemTableRow(TABLES.PARTITIONS, {
        partition_id: PARTITION_ID, table_id: 'sir_rows',
        leader_node_id: world.leader.nodeId, status: 'active',
        created_at: 1, updated_at: 1});
      let cleanupEngaged = false;
      const cleanupResources = handler.cleanupReplicaResources.bind(handler);
      handler.cleanupReplicaResources = (...args) => {
        cleanupEngaged = true;
        return cleanupResources(...args);
      };
      const reconnect = cutOff(world, third);
      await writeAndCompact(world, 1, CADENCE_ENTRY_THRESHOLD);
      const held = holdNextOpen(world, replicaId);
      const factory = handler.createPartitionService.bind(handler);
      let product;
      let realShutdown;
      let shutdownCalls = 0;
      handler.createPartitionService = async (options) => {
        const service = await factory(options);
        if (options.replicaId === replicaId) {
          product = service;
          realShutdown = service.shutdown.bind(service);
          service.shutdown = async () => {
            shutdownCalls += 1;
            throw new Error('injected replacement shutdown failure before handle close');
          };
        }
        return service;
      };
      reconnect();
      await held.reached;
      // The existing durable removal reconciliation path, with a real
      // REMOVING transition. No fabricated cleanup token or release success.
      await handler.persistReplicaStatusWithRetry(replicaId,
        ReplicaStatus.REMOVING, {partitionId: PARTITION_ID});
      const cleanup = handler.reconcileRemovedReplicaCleanup(replicaId, PARTITION_ID)
        .then((value) => ({value}), (error) => ({error: error.message, code: error.code}));
      await waitFor(() => recreationOf(world, replicaId).state === 'claimed',
        'durable removal claims the episode while the factory is held');
      held.open();
      try {
        const outcome = await cleanup;
        let readable = false;
        let readError = null;
        try {
          readable = product.db.prepare('SELECT 1 AS alive').get().alive === 1;
        } catch (error) {
          readError = error.message;
        }
        const facts = {outcome, cleanupEngaged, shutdownCalls, dbPath: product.dbPath,
          pendingRelease: handler.pendingRuntimeShutdowns.has(product),
          productShutdown: product.isShutdown,
          databaseExists: fs.existsSync(third.dbPath), readable, readError,
          episode: recreationOf(world, replicaId)};
        console.log('FAILED_RELEASE_FACTS', JSON.stringify(facts));
        assert.equal(cleanupEngaged, true, 'real storage cleanup must engage');
        assert.ok(shutdownCalls > 0, 'fault engaged at the product release');
        assert.equal(facts.pendingRelease, true, 'exact failed product is retained');
        assert.equal(readable, true, 'the real replacement SQLite handle remains open');
        assert.equal(facts.databaseExists, true,
          'cleanup must not unlink the database while its replacement handle is open');
        assert.equal(outcome.code, 'REPLICA_RUNTIME_RELEASE_DEFERRED');
        const owner = handler.getReplicaCleanupTombstoneOwner();
        const retained = await owner.observeAuthority(replicaId);
        assert.equal(retained.kind, 'cleanup_owned');
        const nativeHandle = product.db;
        product.shutdown = realShutdown;
        assert.equal(await handler.reconcileRemovedReplicaCleanup(replicaId, PARTITION_ID), true);
        assert.equal(nativeHandle.open, false, 'native handle closes before successful deletion');
        assert.equal(fs.existsSync(third.dbPath), false);
        assert.equal(handler.pendingRuntimeShutdowns.has(product), false);
        assert.equal(await owner.observeAuthority(replicaId), false);
      } finally {
        held.open();
        if (product) {
          product.shutdown = realShutdown; await realShutdown();
        }
      }
    });
  });
