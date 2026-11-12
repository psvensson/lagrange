// Discriminating investigation only: no production repair or acceptance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {TABLES} from '../../../src/constants/index.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {CADENCE_ENTRY_THRESHOLD, PARTITION_ID, cutOff, holdNextOpen,
  recreationOf, withInstallWorld, writeAndCompact, waitFor} from
  './snapshot-install-investigation-fixture.js';

test('control: a successful replacement release closes its handle before cleanup',
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
            return realShutdown();
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
        .then(value => ({value}), error => ({error: error.message, code: error.code}));
      await waitFor(() => recreationOf(world, replicaId).state === 'claimed',
        'durable removal claims the episode while the factory is held');
      held.open();
      try {
        const outcome = await cleanup;
        let readable = false;
        let readError = null;
        try { readable = product.db.prepare('SELECT 1 AS alive').get().alive === 1; }
        catch (error) { readError = error.message; }
        const facts = {outcome, cleanupEngaged, shutdownCalls, dbPath: product.dbPath,
          pendingRelease: handler.pendingRuntimeShutdowns.has(product),
          productShutdown: product.isShutdown,
          databaseExists: fs.existsSync(third.dbPath), readable, readError,
          episode: recreationOf(world, replicaId)};
        console.log('SUCCESSFUL_RELEASE_CONTROL', JSON.stringify(facts));
        assert.equal(cleanupEngaged, true, 'real storage cleanup must engage');
        assert.ok(shutdownCalls > 0, 'fault engaged at the product release');
        assert.equal(facts.pendingRelease, false, 'released product leaves no shutdown debt');
        assert.equal(readable, false, 'the real replacement SQLite handle is closed');
        assert.equal(facts.databaseExists, false, 'cleanup removes storage after release');
      } finally {
        held.open();
        if (product) { product.shutdown = realShutdown; await realShutdown(); }
      }
    });
  });
