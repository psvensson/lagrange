// Witness for the critical-spread-transition-authority-carry quest: the
// authorization's carriage on the operation row, end to end through the real
// coordinator creation path.
//
// SCOPE. The coordinator completes the policy-minted record with the
// destination replica and the operation id AFTER the canonical replica id is
// allocated, stamps it on the operation's existing first steps-history
// metadata record, and the row decode exposes it. A move that carries no
// authorization produces a row byte-identical to main's: the digests below
// were captured by running this same creation path on main at f2fed102a
// BEFORE any src file of this quest was edited
// (scratch capture-row-digest.mjs; each digest is stable across runs).
//
// Raw node:test so the anchored receipt runner selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
} from './test-helpers.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const CRITICAL_PARTITION_ID = 'schema_operations-p1';
const SECOND_CRITICAL_PARTITION_ID = 'sql_transactions-p1';
const ORDINARY_PARTITION_ID = 'tbl-users-p1';
const SEED_NODE_ID = 'seed-node';
const PUBLISHED_EPOCH = 4;
const FROZEN_TIME = 0;
const STEPS_HISTORY_PARAM_INDEX = 13;
const TIMESTAMP_PARAM_INDEXES = new Set([9, 10, 11]);
const AUTHORIZATION_KEY = OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION;
const MOVE_FIELD = SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD;
const INSERT_STATEMENT_FRAGMENT = 'INSERT INTO replica_operations';

// Main's canonical INSERT payload digests for moves carrying NO authorization,
// captured at f2fed102a before this quest edited src. Timestamps (created_at,
// updated_at, completed_at and each steps-history entry's own timestamp) are
// the only values normalised; every other byte is main's.
const MAIN_ROW_DIGEST = Object.freeze({
  'critical-add':
    '40c8597b14c5bdaa99cd60e88c5a1985693d3f51c13dcaf53b0360a1ab086334',
  'critical-add-no-epoch':
    '6d274a9570c7df79fb5ee621f5ae90ff7e57c3b3095fd617507139de2c549fb5',
  'ordinary-add':
    'ebd6a7336f6520b95980d623bb3a70566e0293121371956afa4e30b95009483c',
  'critical-replace':
    '28e6ca7849148315cea3f117ccf798aa3f282706c439cdefcdd25c6ca6eb627b',
  'ordinary-remove':
    '722d411ac720e9d8900d17eb2a64238840150848c0e554036d25e0f3861a88fb',
});

const UNAUTHORIZED_MOVES = Object.freeze([
  ['critical-add', {
    type: OperationType.ADD, partitionId: CRITICAL_PARTITION_ID,
    nodeId: 'node-2', operationIntentId: 'op-fixed-1',
    replicaIntentId: `${CRITICAL_PARTITION_ID}-r5`,
    membershipPublicationEpoch: PUBLISHED_EPOCH,
  }],
  ['critical-add-no-epoch', {
    type: OperationType.ADD, partitionId: SECOND_CRITICAL_PARTITION_ID,
    nodeId: 'node-3', operationIntentId: 'op-fixed-2',
    replicaIntentId: `${SECOND_CRITICAL_PARTITION_ID}-r5`,
  }],
  ['ordinary-add', {
    type: OperationType.ADD, partitionId: ORDINARY_PARTITION_ID,
    nodeId: 'node-2', operationIntentId: 'op-fixed-3',
    replicaIntentId: `${ORDINARY_PARTITION_ID}-r4`,
    membershipPublicationEpoch: PUBLISHED_EPOCH,
  }],
  ['critical-replace', {
    type: OperationType.REPLACE, partitionId: CRITICAL_PARTITION_ID,
    nodeId: 'node-4', replicaId: `${CRITICAL_PARTITION_ID}-r2`,
    operationIntentId: 'op-fixed-4',
    replicaIntentId: `${CRITICAL_PARTITION_ID}-r6`,
    membershipPublicationEpoch: PUBLISHED_EPOCH,
  }],
  ['ordinary-remove', {
    type: OperationType.REMOVE, partitionId: ORDINARY_PARTITION_ID,
    nodeId: 'node-2', replicaId: `${ORDINARY_PARTITION_ID}-r3`,
    operationIntentId: 'op-fixed-5',
    membershipPublicationEpoch: PUBLISHED_EPOCH,
  }],
]);

const POLICY_AUTHORIZATION = Object.freeze({
  intent: SPREAD_CURE_TRANSITION_INTENT,
  desiredReplicationFactor: 3,
  observedMembershipEpoch: PUBLISHED_EPOCH,
  observedVoterCount: 4,
  authorizedResultingVoterCount: 5,
  destinationNodeId: 'node-2',
});

function canonicalizeStepsHistory(text) {
  const parsed = JSON.parse(text);
  for (const entry of parsed) {
    if (entry && typeof entry === 'object' &&
        typeof entry.timestamp === 'number') {
      entry.timestamp = FROZEN_TIME;
    }
  }
  return JSON.stringify(parsed);
}

function canonicalInsert(params) {
  return JSON.stringify(params.map((value, index) => {
    if (index === STEPS_HISTORY_PARAM_INDEX && typeof value === 'string') {
      return canonicalizeStepsHistory(value);
    }
    if (TIMESTAMP_PARAM_INDEXES.has(index) && typeof value === 'number') {
      return FROZEN_TIME;
    }
    return value;
  }));
}

async function createOperationCapturingInserts(move) {
  const cache = createMockCache({});
  const readiness = createMockControlPlaneReadinessService({
    systemTableCache: cache, defaultRepairEligible: true,
  });
  const coordinator = createTestCoordinator({
    nodeId: SEED_NODE_ID,
    enableTimeouts: false,
    systemTableCache: cache,
    controlPlaneReadinessService: {
      ...readiness,
      getCurrentPublishedMembershipEpochSync: () => PUBLISHED_EPOCH,
    },
  });
  coordinator.initialize();
  const inserts = [];
  const engine = coordinator.sqlQueryEngine;
  const executeQuery = engine.executeQuery.bind(engine);
  engine.executeQuery = async (sql, params) => {
    if (String(sql).includes(INSERT_STATEMENT_FRAGMENT)) {
      inserts.push({params, canonical: canonicalInsert(params)});
    }
    return executeQuery(sql, params);
  };
  try {
    const operation = await coordinator.createOperation(move);
    return {operation, inserts, coordinator};
  } finally {
    await coordinator.shutdown();
  }
}

test('the authorization rides the operation row and rows without it stay ' +
  'byte-identical to main', async () => {
  // 1. Every move shape that carries no authorization writes main's row.
  for (const [name, move] of UNAUTHORIZED_MOVES) {
    const {inserts} = await createOperationCapturingInserts(move);
    assert.equal(inserts.length, 1, `${name} wrote exactly one row`);
    const digest = createHash('sha256')
      .update(inserts[0].canonical).digest('hex');
    assert.equal(digest, MAIN_ROW_DIGEST[name],
      `${name}: the row is byte-identical to main's`);
    assert.equal(inserts[0].canonical.includes(AUTHORIZATION_KEY), false,
      `${name}: a field absent from the move stays absent on the row`);
  }

  // 2. The authorized cure ADD: the coordinator completes the policy record
  // and stamps it on steps_history[0].
  const authorizedMove = {
    type: OperationType.ADD,
    partitionId: CRITICAL_PARTITION_ID,
    nodeId: 'node-2',
    membershipPublicationEpoch: PUBLISHED_EPOCH,
    [MOVE_FIELD]: POLICY_AUTHORIZATION,
  };
  const {operation, inserts} =
    await createOperationCapturingInserts(authorizedMove);
  assert.equal(inserts.length, 1, 'the authorized ADD wrote one row');
  const stepsHistory = JSON.parse(inserts[0].params[STEPS_HISTORY_PARAM_INDEX]);
  const stamped = stepsHistory[0][AUTHORIZATION_KEY];
  assert.ok(stamped, 'the first steps-history record carries the key');
  assert.equal(stepsHistory.length, 1,
    'no second record is keyed off the operation');
  assert.deepEqual(stamped, {
    ...POLICY_AUTHORIZATION,
    destinationReplicaId: operation.replicaId,
    operationId: operation.operationId,
  }, 'the coordinator adds only the destination replica and the operation id');
  assert.equal(typeof operation.replicaId, 'string');
  assert.ok(operation.replicaId.startsWith(`${CRITICAL_PARTITION_ID}-r`),
    'the destination replica is the allocated canonical replica id');

  // 3. The binding owner decodes the persisted row, and it is the ONLY
  // decoder of this record: rowToOperation is untouched by this quest, so no
  // second decode of the same bytes can drift from this one.
  const persistedRow = {
    operation_id: operation.operationId,
    type: OperationType.ADD,
    partition_id: CRITICAL_PARTITION_ID,
    entity_type: 'partition',
    entity_id: CRITICAL_PARTITION_ID,
    replica_id: operation.replicaId,
    source_node_id: SEED_NODE_ID,
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: 'PENDING',
    steps_history: inserts[0].params[STEPS_HISTORY_PARAM_INDEX],
    membership_publication_epoch: PUBLISHED_EPOCH,
  };
  const binding =
    decodeSpreadCureTransitionAuthorizationFromOperationRow(persistedRow);
  assert.equal(binding.state, 'present');
  assert.deepEqual({...binding.authorization}, stamped,
    'the binding owner decodes exactly what the coordinator stamped');
  const {coordinator: decoder} =
    await createOperationCapturingInserts(authorizedMove);
  const decoded = decoder.repository.rowToOperation(persistedRow);
  assert.equal(Object.hasOwn(decoded, MOVE_FIELD), false,
    'and the operation-row decoder gains no field of its own');

  // 4. A move whose authorization is not a sanctioned policy record stamps
  // nothing: the carrier never repairs a malformed value into a row.
  for (const junk of ['junk', 7, [], {intent: 'other'}, null]) {
    const {inserts: junkInserts} = await createOperationCapturingInserts({
      type: OperationType.ADD,
      partitionId: SECOND_CRITICAL_PARTITION_ID,
      nodeId: 'node-3',
      membershipPublicationEpoch: PUBLISHED_EPOCH,
      [MOVE_FIELD]: junk,
    });
    assert.equal(
      junkInserts[0].canonical.includes(AUTHORIZATION_KEY), false,
      `an unsanctioned move field (${typeof junk}) stamps nothing`);
  }
});
