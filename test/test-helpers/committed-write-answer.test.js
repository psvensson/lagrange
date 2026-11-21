// Pins test/test-helpers/committed-write-answer.js against the real judge:
// every answer the helper builds (engine INSERT / UPDATE / DELETE, a settled
// replay, the real CDC service's insert / upsert / update / delete) is
// APPLIED by judgeNamedWriteOutcome for its own key and partition, and only
// for them; the receipt-less shapes the old doubles answered are UNKNOWN; and
// a named gateway write over the real CDC service and the helper's engine
// settles. If a producer changes what it answers, this file and the helper
// move together.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {NAMED_WRITE_ATTEMPT, judgeNamedWriteOutcome} from
  '../../src/control-plane/control-plane-named-write-outcome.js';
import {
  controlPlaneWriteIdentity,
  releaseControlPlaneWriteIdentity,
} from '../../src/control-plane/control-plane-write-identity.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  cdcCommittedWriteAnswer,
  engineCommittedWriteAnswer,
} from './committed-write-answer.js';

const KEY = 'committed-write-answer-pin-key';
const OTHER_KEY = 'committed-write-answer-pin-other-key';
const NODES_PARTITION = INITIAL_PARTITION_IDS[TABLES.NODES];
const ENDPOINTS_PARTITION = INITIAL_PARTITION_IDS[TABLES.NODE_ENDPOINTS];

function attempt(partitionId, key = KEY) {
  return {key, partitionId, unresolved: false};
}

function endpointRow(address = 'ws://pin:1') {
  return {endpoint_id: 'ep-pin-ws', node_id: 'pin-node', endpoint_type: 'ws',
    address, boot_incarnation: 1, created_at: 1, updated_at: 1};
}

test('engine answers built by the producers are APPLIED for their own entry only', async () => {
  const cases = [
    ['INSERT', 'INSERT INTO node_endpoints (endpoint_id, node_id) VALUES (?, ?)',
      ['ep-1', 'pin-node'], ENDPOINTS_PARTITION, {}],
    ['UPDATE', 'UPDATE nodes SET status = ? WHERE node_id = ?',
      ['active', 'pin-node'], NODES_PARTITION, {}],
    ['UPDATE of zero rows', 'UPDATE nodes SET status = ? WHERE node_id = ?',
      ['active', 'absent-node'], NODES_PARTITION, {changes: 0}],
    ['DELETE', 'DELETE FROM node_endpoints WHERE endpoint_id = ?',
      ['ep-1'], ENDPOINTS_PARTITION, {}],
    ['settled replay', 'UPDATE nodes SET status = ? WHERE node_id = ?',
      ['active', 'pin-node'], NODES_PARTITION, {settledReplay: true, logIndex: 7, term: 2}],
  ];
  for (const [label, sql, params, partitionId, effect] of cases) {
    const answer = await engineCommittedWriteAnswer(sql, params, {idempotencyKey: KEY}, effect);
    assert.equal(answer.success, true, `${label}: the engine answers success`);
    assert.equal(answer.affectedRows, effect.changes ?? 1, `${label}: the applied count`);
    assert.equal(judgeNamedWriteOutcome(answer, attempt(partitionId)),
      NAMED_WRITE_ATTEMPT.APPLIED, `${label}: APPLIED for its own key and partition`);
    assert.equal(judgeNamedWriteOutcome(answer, attempt(partitionId, OTHER_KEY)),
      NAMED_WRITE_ATTEMPT.UNKNOWN, `${label}: not APPLIED for another key`);
    assert.equal(judgeNamedWriteOutcome(answer, attempt('another-p1')),
      NAMED_WRITE_ATTEMPT.UNKNOWN, `${label}: not APPLIED for another partition`);
  }
});

test('the real CDC service over the helper engine answers APPLIED for each write method', async () => {
  const options = {idempotencyKey: KEY};
  const cases = [
    ['insertSystemTableRow', [TABLES.NODE_ENDPOINTS, endpointRow(), options], ENDPOINTS_PARTITION],
    ['upsertSystemTableRow', [TABLES.NODE_ENDPOINTS, endpointRow(), options], ENDPOINTS_PARTITION],
    ['updateSystemTableRow', [TABLES.NODES, {node_id: 'pin-node'}, {status: 'active'}, options],
      NODES_PARTITION],
    ['deleteSystemTableRow', [TABLES.NODE_ENDPOINTS, {endpoint_id: 'ep-pin-ws'}, options],
      ENDPOINTS_PARTITION],
  ];
  for (const [method, args, partitionId] of cases) {
    const answer = await cdcCommittedWriteAnswer(method, args);
    assert.equal(answer.success, true, `${method}: success`);
    assert.equal(answer.committed, true, `${method}: committed`);
    assert.equal(judgeNamedWriteOutcome(answer, attempt(partitionId)),
      NAMED_WRITE_ATTEMPT.APPLIED, `${method}: APPLIED for its own key and partition`);
    assert.equal(judgeNamedWriteOutcome(answer, attempt(partitionId, OTHER_KEY)),
      NAMED_WRITE_ATTEMPT.UNKNOWN, `${method}: not APPLIED for another key`);
  }
});

test('the receipt-less shapes the old doubles answered are UNKNOWN', () => {
  const shapes = [
    ['bare success', {success: true}],
    ['success with a count', {success: true, affectedRows: 1}],
    ['CDC-wrapped bare engine answer', {success: true, committed: true,
      partitionResult: {success: true, affectedRows: 1}}],
    ['insertViaUpsert before the migration', {success: true, partitionResult: {affectedRows: 1}}],
    ['engine answer with a nested count', {success: true, affectedRows: 1,
      partitionResult: {affectedRows: 1}}],
  ];
  for (const [label, answer] of shapes) {
    assert.equal(judgeNamedWriteOutcome(answer, attempt(NODES_PARTITION)),
      NAMED_WRITE_ATTEMPT.UNKNOWN, label);
  }
});

test('a named gateway write over the real CDC service and the helper engine settles',
  async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'fatal'});
    const engine = {
      writes: 0,
      async executeQuery(sql, params, options) {
        engine.writes += 1;
        return engineCommittedWriteAnswer(sql, params, options);
      },
    };
    const cdc = new CDCIntegrationService({nodeId: 'pin-node', sqlQueryEngine: engine});
    cdc.initialize();
    const gateway = new ControlPlaneSystemTableGateway({nodeId: 'pin-node',
      cdcIntegrationService: cdc});
    const name = controlPlaneWriteIdentity('committed-write-answer-pin', 'gateway', 1);
    try {
      for (const [index, address] of ['ws://pin:1', 'ws://pin:2'].entries()) {
        const answer = await gateway.insertSystemTableRow(TABLES.NODE_ENDPOINTS,
          endpointRow(address), {writeIdentity: name, queryTimeoutMs: 2000});
        assert.equal(answer.success, true, `write ${index + 1} settles`);
        assert.notEqual(answer.deferRetry, true, `write ${index + 1} owes no re-send`);
        assert.equal(answer.pendingInstance, undefined, `write ${index + 1} holds no instance`);
        assert.equal(engine.writes, index + 1,
          `write ${index + 1} is one delivery: nothing held was re-delivered`);
      }
    } finally {
      releaseControlPlaneWriteIdentity(name);
      cdc.markShuttingDown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
