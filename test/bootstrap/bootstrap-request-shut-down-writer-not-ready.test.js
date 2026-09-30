// A seed whose writer shuts down under a bootstrap request answers the
// retryable not-ready class, so the joiner tries again.
//
// The CDC integration service's SHUT_DOWN is terminal for the node it runs on:
// no retry through that writer can succeed. For a remote requester it means
// the seed is going away, which the joiner answers by contacting a seed again
// (the retryable 503 BOOTSTRAP_NOT_READY class), never a terminal 500. The
// bootstrap request owner maps it; the joiner's seed-contact classifier reads
// the answer. Composition: the real bootstrap API over fastify's inject, the
// real CDC service's terminal answer as the admitted work's failure, and the
// joiner's real classifier on the response the seed sent.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_ERROR} from
  '../../src/bootstrap/bootstrap-api-constants.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from
  '../../src/bootstrap/bootstrap-constants.js';
import {deriveSeedContactFailureFields} from
  '../../src/bootstrap/phases/contact-seed-failure-signals.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import * as CDC_CONSTANTS from '../../src/cdc/cdc-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HTTP_STATUS} from '../../src/constants/index.js';

const SEED_NODE_ID = 'seed-node-1';
const SEED_NODE_ADDRESS = 'ws://localhost:8080';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440031';
const JOINER_NODE_ADDRESS = 'ws://localhost:9131';
const LOG_LEVEL = 'error';
// Configured, never bound: the API is driven through fastify's inject.
const REST_API_PORT = 9999;
const UNTYPED_FAILURE_MESSAGE = 'an untyped failure of the admitted work';
const EMPTY_LIST = Object.freeze([]);
const SYSTEM_TABLE_CACHE = Object.freeze({
  get: () => null,
  getAll: () => EMPTY_LIST,
  filter: () => EMPTY_LIST,
  find: () => null,
  getReadyNodes: () => EMPTY_LIST,
});

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: SEED_NODE_ID, restApiPort: REST_API_PORT},
    logging: {level: LOG_LEVEL},
  });
  LoggingService.getInstance().initialize({level: LOG_LEVEL});
}

// The admitted bootstrap work's control-plane write reaches this seed's CDC
// service after it was marked shutting down: its terminal answer.
async function shutDownWriterAnswer() {
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: SEED_NODE_ID,
  });
  cdcIntegrationService.markShuttingDown();
  return cdcIntegrationService.executeSQL(
    'INSERT OR REPLACE INTO nodes (node_id) VALUES (?)', [JOINER_NODE_ID],
  ).then(() => null, (error) => error);
}

test('a bootstrap request whose seed writer shut down is answered ' +
  'retryable not-ready, and the joiner retries', async () => {
  initializeEnvironment();
  const writerFailure = await shutDownWriterAnswer();
  const shutDownCode = CDC_CONSTANTS.CDC_ERROR_CODE?.SHUT_DOWN;
  assert.ok(typeof shutDownCode === 'string' &&
    writerFailure?.code === shutDownCode,
  'the shut-down writer answers its typed SHUT_DOWN decision');

  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: SYSTEM_TABLE_CACHE,
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync: () => ({ready: true}),
    },
  });
  api.getBlockingMoveReplicaBootstrapAdmissions = async () => EMPTY_LIST;
  api.waitForServiceLeaders = async () => ({ready: true});
  let untypedFailure = null;
  api.determineAndReserveMessageGroupAssignment = async () => {
    throw untypedFailure || writerFailure;
  };
  await api.initialize(0, {listen: false});
  try {
    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS},
    });
    assert.equal(response.statusCode, HTTP_STATUS.SERVICE_UNAVAILABLE,
      'the seed answers the retryable 503, not a terminal 500');
    const body = JSON.parse(response.body);
    assert.equal(body.error, BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      'the answer is the canonical not-ready error');
    assert.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      'the answer carries the canonical not-ready code');

    const joinerView = deriveSeedContactFailureFields(
      new Error(`HTTP ${response.statusCode}: ${response.body}`), null);
    assert.equal(joinerView.retryable, true,
      'the joiner classifies the answer as retryable');
    assert.equal(joinerView.retryableCode, true,
      'by its typed not-ready code, not only its status');

    // The 503 comes from the typed decision, not from translating any
    // failure: the same request failing with an untyped error is a 500.
    untypedFailure = new Error(UNTYPED_FAILURE_MESSAGE);
    const control = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS},
    });
    assert.equal(control.statusCode, HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'an untyped failure of the same work is not answered not-ready');
  } finally {
    await api.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
