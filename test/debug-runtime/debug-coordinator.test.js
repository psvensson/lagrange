import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
  DebugCoordinator,
  decideMonotonicTransition,
} from '../../src/debug-runtime/debug-coordinator.js';
import {
  DEBUG_METADATA_TABLE as DT,
  DEBUG_SESSION_FIELD as DSF,
} from '../../src/debug-runtime/debug-metadata-constants.js';

describe('decideMonotonicTransition', () => {
  it('accepts initial and stage advances, rejects stale stage', () => {
    const initial = decideMonotonicTransition(null, {
      lineageId: 'l',
      stageId: 1,
      endpoint: 'ws://a',
      nodeId: 'a',
      updatedAt: 1,
    });
    assert.equal(initial.applied, true);

    const advance = decideMonotonicTransition({
      lineageId: 'l',
      stageId: 1,
      endpoint: 'ws://a',
      nodeId: 'a',
      updatedAt: 1,
    }, {
      lineageId: 'l',
      stageId: 2,
      endpoint: 'ws://b',
      nodeId: 'b',
      updatedAt: 2,
    });
    assert.equal(advance.applied, true);

    const staleStage = decideMonotonicTransition({
      lineageId: 'l',
      stageId: 3,
      endpoint: 'ws://c',
      nodeId: 'c',
      updatedAt: 3,
    }, {
      lineageId: 'l',
      stageId: 2,
      endpoint: 'ws://b',
      nodeId: 'b',
      updatedAt: 4,
    });
    assert.equal(staleStage.applied, false);
    assert.equal(staleStage.reason, 'stale_stage');
  });
});

describe('DebugCoordinator', () => {
  it('hydrates from system metadata and exposes latest lineage endpoint',
    () => {
      const coordinator = new DebugCoordinator({
        systemTableCache: {
          getAll(tableName) {
            assert.equal(tableName, DT.SESSIONS);
            return [
              {
                [DSF.LINEAGE_ID]: 'lineage-1',
                [DSF.STAGE_ID]: 1,
                [DSF.ENDPOINT]: 'ws://node-a/stage-1',
                [DSF.NODE_ID]: 'node-a',
                [DSF.SESSION_ID]: 's1',
                [DSF.UPDATED_AT]: 10,
              },
              {
                [DSF.LINEAGE_ID]: 'lineage-1',
                [DSF.STAGE_ID]: 2,
                [DSF.ENDPOINT]: 'ws://node-b/stage-2',
                [DSF.NODE_ID]: 'node-b',
                [DSF.SESSION_ID]: 's1',
                [DSF.UPDATED_AT]: 20,
              },
            ];
          },
        },
      });

      const applied = coordinator.hydrateFromSystemMetadata();
      assert.equal(applied, 2);

      const current = coordinator.getCurrentEndpoint({
        lineageId: 'lineage-1',
      });
      assert.equal(current.stageId, 2);
      assert.equal(current.endpoint, 'ws://node-b/stage-2');
    });

  it('binds to CDC and applies monotonic transitions', () => {
    const cdc = new EventEmitter();
    const coordinator = new DebugCoordinator();
    coordinator.bindCdcIntegrationService(cdc);

    cdc.emit('upsert', {
      tableName: DT.SESSIONS,
      data: {
        [DSF.LINEAGE_ID]: 'lineage-2',
        [DSF.STAGE_ID]: 5,
        [DSF.ENDPOINT]: 'ws://node-a/stage-5',
        [DSF.NODE_ID]: 'node-a',
        [DSF.UPDATED_AT]: 50,
      },
    });

    cdc.emit('update', {
      tableName: DT.SESSIONS,
      data: {
        [DSF.LINEAGE_ID]: 'lineage-2',
        [DSF.STAGE_ID]: 4,
        [DSF.ENDPOINT]: 'ws://node-b/stage-4',
        [DSF.NODE_ID]: 'node-b',
        [DSF.UPDATED_AT]: 60,
      },
    });

    const current = coordinator.getCurrentEndpoint({
      lineageId: 'lineage-2',
    });
    assert.equal(current.stageId, 5);
    assert.equal(current.endpoint, 'ws://node-a/stage-5');
  });

  it('publishes lineage handoff notifications to subscribers', () => {
    const coordinator = new DebugCoordinator({now: () => 100});
    const received = [];
    const unsubscribe = coordinator.subscribeLineage(
      'lineage-3',
      (event) => received.push(event),
    );

    coordinator.upsertStageEndpoint({
      lineageId: 'lineage-3',
      stageId: 1,
      endpoint: 'ws://node-a',
      nodeId: 'node-a',
    });
    coordinator.upsertStageEndpoint({
      lineageId: 'lineage-3',
      stageId: 2,
      endpoint: 'ws://node-b',
      nodeId: 'node-b',
    });
    unsubscribe();
    coordinator.upsertStageEndpoint({
      lineageId: 'lineage-3',
      stageId: 3,
      endpoint: 'ws://node-c',
      nodeId: 'node-c',
    });

    assert.equal(received.length, 2);
    assert.equal(received[0].current.stageId, 1);
    assert.equal(received[1].current.stageId, 2);
  });
});
