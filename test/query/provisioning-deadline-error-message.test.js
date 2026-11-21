// An expired provisioning deadline is a typed, NON-EMPTY error
// (line-regression-causes stage 2, item 4): assertProvisioningAttemptBudget
// took its message from QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
// which the error vocabulary does not define (the text lives only in
// QUERY_LOG_MSG), so every exhausted CREATE TABLE / founding deadline answered
// an empty error. Plus the vocabulary census: every QUERY_ERROR_MSG member
// referenced under src/query is defined.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {createTimeoutBudget} from '../../src/control-plane/timeout-budget.js';
import {createProvisioningReadyService} from './sql-query-engine-test-support.js';

ConfigurationManager.getInstance().initialize();

const TIMEOUT_CODE = 'TIMEOUT';
const QUERY_SOURCE_ROOT = 'src/query';
const ERROR_MSG_REFERENCE = /\bQUERY_ERROR_MSG\.([A-Z][A-Z0-9_]*)\b/gu;

// A deadline that ended long before any provisioning step can run.
function exhaustedBudget() {
  return createTimeoutBudget({configuredBudgetMs: 1, startedAtMs: 0, now: () => 0});
}

function assertTypedNonEmptyTimeout(error) {
  assert.equal(error?.code, TIMEOUT_CODE, 'the typed timeout code');
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0, `a non-empty message (got ${JSON.stringify(error.message)})`);
  assert.equal(error.message, QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DEADLINE_EXHAUSTED,
    'the one named provisioning-deadline error of the query error vocabulary');
  return true;
}

test('the real assertProvisioningAttemptBudget answers a typed, non-empty error', () => {
  const owner = {nowFn: () => 5};
  assert.throws(() => SQLQueryEngine.prototype.assertProvisioningAttemptBudget.call(owner,
    exhaustedBudget()), assertTypedNonEmptyTimeout);
});

test('CREATE TABLE provisioning past its deadline rejects with the typed, non-empty error',
  async () => {
    const localNodeId = 'node-a';
    const nodes = ['node-a', 'node-b', 'node-c'].map((nodeId) => ({node_id: nodeId,
      status: 'active', connection_state: 'ready'}));
    const cache = {
      filter: (type, predicate) => (type === TABLES.NODES ? nodes.filter(predicate) : []),
      getAll: (type) => (type === TABLES.NODES ? nodes : []),
    };
    const admissionChecks = [];
    const engine = new SQLQueryEngine({
      nodeId: localNodeId,
      systemCache: cache,
      messageRouter: {deliver: async () =>
        buildDeliveryEnvelope({acknowledged: true}, {success: true})},
      rebalanceCoordinator: {
        async checkProvisioningAdmission(move) {
          admissionChecks.push(move.nodeId);
          return {allowed: true};
        },
        async createOperation() {
          throw new Error('no operation may be created past the deadline');
        },
        async executeOperation() {
          throw new Error('no operation may run past the deadline');
        },
      },
      controlPlaneReadinessService: createProvisioningReadyService(cache),
    });
    engine.waitForRoutablePartitionServiceCount = async () => {};
    engine.waitForPartitionLeaderService = async () => {};
    await assert.rejects(engine.provisionInitialTablePartition({
      partitionId: 'tbl-deadline-p1',
      replicaCount: 3,
      minimumRoutableReplicaCount: 2,
      minimumRoutableReplicaCountWasDefaulted: true,
      timeoutBudget: exhaustedBudget(),
    }), assertTypedNonEmptyTimeout);
    assert.deepEqual(admissionChecks, [], 'no admission read was spent past the deadline');
  });

function querySourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return querySourceFiles(entryPath);
    return entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

test('every QUERY_ERROR_MSG member referenced under src/query is defined', () => {
  const missing = [];
  for (const file of querySourceFiles(QUERY_SOURCE_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(ERROR_MSG_REFERENCE)) {
      if (typeof QUERY_ERROR_MSG[match[1]] !== 'string' || QUERY_ERROR_MSG[match[1]].length === 0) {
        const line = text.slice(0, match.index).split('\n').length;
        missing.push(`${file}:${line} QUERY_ERROR_MSG.${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'references to undefined error messages answer empty errors');
});
