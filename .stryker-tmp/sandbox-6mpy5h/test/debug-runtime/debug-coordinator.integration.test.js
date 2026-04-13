// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {DebugCoordinator} from '../../src/debug-runtime/debug-coordinator.js';
import {
  DEBUG_METADATA_TABLE as DT,
  DEBUG_SESSION_FIELD as DSF,
} from '../../src/debug-runtime/debug-metadata-constants.js';

describe('DebugCoordinator multi-node handoff integration', () => {
  it('auto-handoffs across nodes and keeps continue routing without reconnect',
    () => {
      const cdc = new EventEmitter();
      const coordinator = new DebugCoordinator();
      coordinator.bindCdcIntegrationService(cdc);

      const endpointRegistry = new Map();
      endpointRegistry.set('ws://node-a/debug', {
        continueCalls: 0,
        continueExecution() {
          this.continueCalls += 1;
          return {ok: true, endpoint: 'node-a'};
        },
      });
      endpointRegistry.set('ws://node-b/debug', {
        continueCalls: 0,
        continueExecution() {
          this.continueCalls += 1;
          return {ok: true, endpoint: 'node-b'};
        },
      });

      const client = new CoordinatedDebugClient(
        coordinator,
        endpointRegistry,
      );
      client.attachLineage('lineage-multi');

      cdc.emit('upsert', {
        tableName: DT.SESSIONS,
        data: {
          [DSF.LINEAGE_ID]: 'lineage-multi',
          [DSF.STAGE_ID]: 1,
          [DSF.ENDPOINT]: 'ws://node-a/debug',
          [DSF.NODE_ID]: 'node-a',
          [DSF.SESSION_ID]: 'session-multi',
          [DSF.UPDATED_AT]: 10,
        },
      });

      const firstContinue = client.continueExecution();
      assert.equal(firstContinue.endpoint, 'node-a');

      cdc.emit('upsert', {
        tableName: DT.SESSIONS,
        data: {
          [DSF.LINEAGE_ID]: 'lineage-multi',
          [DSF.STAGE_ID]: 2,
          [DSF.ENDPOINT]: 'ws://node-b/debug',
          [DSF.NODE_ID]: 'node-b',
          [DSF.SESSION_ID]: 'session-multi',
          [DSF.UPDATED_AT]: 20,
        },
      });

      const secondContinue = client.continueExecution();
      assert.equal(secondContinue.endpoint, 'node-b');

      assert.equal(
        endpointRegistry.get('ws://node-a/debug').continueCalls,
        1,
      );
      assert.equal(
        endpointRegistry.get('ws://node-b/debug').continueCalls,
        1,
      );
    });
});

/**
 * Client facade that follows DebugCoordinator endpoint handoffs.
 */
class CoordinatedDebugClient {
  /**
   * @param {DebugCoordinator} coordinator
   * @param {Map<string, Object>} endpointRegistry
   */
  constructor(coordinator, endpointRegistry) {
    this.coordinator = coordinator;
    this.endpointRegistry = endpointRegistry;
    this.currentLineageId = null;
    this.currentEndpoint = null;
    this.unsubscribe = null;
  }

  /**
   * @param {string} lineageId
   */
  attachLineage(lineageId) {
    this.currentLineageId = lineageId;
    const existing = this.coordinator.getCurrentEndpoint({
      lineageId,
    });
    this.currentEndpoint = existing ? existing.endpoint : null;
    this.unsubscribe = this.coordinator.subscribeLineage(
      lineageId,
      (event) => {
        this.currentEndpoint = event.current.endpoint;
      },
    );
  }

  /**
   * @return {Object}
   */
  continueExecution() {
    const endpointClient = this.endpointRegistry.get(
      this.currentEndpoint,
    );
    if (!endpointClient) {
      throw new Error('No debug endpoint bound for current lineage');
    }
    return endpointClient.continueExecution();
  }
}
