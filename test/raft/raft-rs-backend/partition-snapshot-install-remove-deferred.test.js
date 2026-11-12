// Witness H2, adopted from the round-4 verifier (quest
// partition-checkpoint-epoch-generation, hand-over coverage model cell 8): a REMOVE that takes over a
// replica stopped for an install, and then cannot make its REMOVING row
// durable (control plane unavailable). Who owns the stopped replica next?
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REPLICA_RECREATE_RETRY_BOUND_MS,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  cutOff,
  durableStatus,
  faultNextOpen,
  recreationOf,
  targetService,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const ROWS = CADENCE_ENTRY_THRESHOLD;

test('H2: a REMOVE that took over a stopped replica but could not publish ' +
  'REMOVING leaves the replica with an owner of its return', {timeout: 240000},
async () => {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const replicaId = world.third.replicaId;
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, ROWS);
    faultNextOpen(world, replicaId, async () => {
      world.store.setAuthoritativeReadAvailable(false);
      throw new Error('the factory could not open the replica');
    });
    reconnect();
    await waitFor(() => recreationOf(world, replicaId)?.attempts >= 2,
      'the recreation is pending behind an unobservable lifecycle');
    assert.equal(recreationOf(world, replicaId).state, 'recreate_pending');
    const events = [];
    world.handler.on('replicaRemovalFailed', (event) => events.push(
      {failed: String(event?.error)}));
    const startedAt = Date.now();
    let removalError = null;
    await world.handler.removeReplicaAsync({
      operationId: `remove-op-${replicaId}`, replicaId,
      partitionId: PARTITION_ID}).catch((error) => {
      removalError = `${error?.code ?? ''} ${error?.message}`;
    });
    const afterRemoval = {
      removalMs: Date.now() - startedAt, removalError, events,
      durable: durableStatus(world, replicaId),
      record: recreationOf(world, replicaId),
      local: world.handler.localReplicas.get(replicaId)?.status,
    };
    // The control plane is back; give the recreation owner three bounds.
    world.store.setAuthoritativeReadAvailable(true);
    await new Promise((resolve) => setTimeout(resolve,
      3 * REPLICA_RECREATE_RETRY_BOUND_MS + 500));
    const facts = {...afterRemoval,
      durableLater: durableStatus(world, replicaId),
      recordLater: recreationOf(world, replicaId),
      created: world.created.length,
      trackedShutdown: targetService(world, replicaId)?.isShutdown ?? null,
      trackedIsOriginal: targetService(world, replicaId) === world.third,
    };
    const removalOwnsIt = [ReplicaStatus.REMOVING, ReplicaStatus.REMOVED,
      ReplicaStatus.FAILED].includes(facts.durableLater);
    const running = targetService(world, replicaId)?.isShutdown === false;
    const recreationOwnsIt = facts.recordLater.state === 'recreate_pending';
    assert.ok(removalOwnsIt || running || recreationOwnsIt,
      'the replica is stopped, its durable row is ' + facts.durableLater +
      ' and no local owner holds its return: ' + JSON.stringify(facts));
  });
});
