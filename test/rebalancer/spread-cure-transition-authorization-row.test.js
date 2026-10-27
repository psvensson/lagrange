// Witness for the critical-spread-transition-authority-carry quest: the
// authorization's carriage on the operation row, end to end through the real
// coordinator creation path.
//
// SCOPE. The coordinator completes the policy-minted record with the
// destination replica and the operation id AFTER the canonical replica id is
// allocated, stamps it on the operation's existing first steps-history
// metadata record, and the row decode exposes it. A move that carries no
// authorization writes exactly the row owner's canonical row: the write is the
// owner's INSERT statement, every pre-admission parameter is the value the
// repository's row builder produced for the same operation in the same
// persist call, the committed-membership stamp a join row carries has exactly
// the answer owner's fields, no authorization field appears anywhere in the
// payload, and the appended CREATE-admission columns begin null.
//
// Superseded (R09, 2026-10-11). Until here the unauthorized rows were held to
// sha256 digests of their first pre-admission parameters, captured on main at
// f2fed102a (2026-09-19) and recaptured for owner decision O1 (2026-09-26: the
// committed-membership stamp in steps_history[0]). A digest freezes bytes two
// owners change deliberately: 0d60f1ac4 "Advance raft-rs membership generation
// slice" (2026-10-07, independently approved 12:24Z, merged at b98722cab)
// added learnersNext, configurationKey and membershipGenerationIndex to the
// committed-membership answer, so the stamp inside every join row's first
// steps-history record changed while the REMOVE row, which carries no stamp,
// still digested to its sealed value (measured 2026-10-11 against the green
// base bb3ed72d0; the message-group columns the same merge appended sit after
// the pre-admission range and did not move it). The expectation is consumed
// from the owners instead of a byte string: the INSERT column list, the
// repository's row builder, and COMMITTED_MEMBERSHIP_ANSWER_FIELD. A
// deliberate owner change is followed; an unowned value on an unauthorized
// row is still refused.
//
// Raw node:test so the anchored receipt runner selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLICA_OPERATION_CREATE_ADMISSION_COLUMNS,
} from '../../src/bootstrap/replica-operation-create-admission-schema-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_FIELD,
} from '../../src/raft/raft-committed-membership-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  REPLICA_OPERATION_INSERT_SQL,
} from '../../src/rebalancer/replica-operation-repository-constants.js';
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
const AUTHORIZATION_KEY = OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION;
const STAMP_KEY = OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP;
const MOVE_FIELD = SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD;
const INSERT_STATEMENT_FRAGMENT = 'INSERT INTO replica_operations';
const STEPS_HISTORY_COLUMN = 'steps_history';
const COLUMN_LIST_OPEN = '(';
const COLUMN_LIST_CLOSE = ')';
const COLUMN_SEPARATOR = ',';

// The owner's INSERT column list, in parameter order, read from the statement
// the repository writes with; the appended CREATE-admission columns are named
// by their own schema owner, and everything before them is pre-admission.
const INSERT_COLUMNS = Object.freeze(REPLICA_OPERATION_INSERT_SQL
  .slice(REPLICA_OPERATION_INSERT_SQL.indexOf(COLUMN_LIST_OPEN) + 1,
    REPLICA_OPERATION_INSERT_SQL.indexOf(COLUMN_LIST_CLOSE))
  .split(COLUMN_SEPARATOR)
  .map((column) => column.trim()));
const ADMISSION_COLUMNS = Object.freeze(
  REPLICA_OPERATION_CREATE_ADMISSION_COLUMNS.map(({name}) => name));
const PRE_ADMISSION_COLUMNS = Object.freeze(
  INSERT_COLUMNS.filter((column) => !ADMISSION_COLUMNS.includes(column)));
const STEPS_HISTORY_PARAM_INDEX = INSERT_COLUMNS.indexOf(STEPS_HISTORY_COLUMN);
const STAMP_FIELDS = Object.freeze(
  Object.values(COMMITTED_MEMBERSHIP_ANSWER_FIELD).slice().sort());

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

// Owner decision O1: a join row (ADD, REPLACE) carries the group's committed
// membership in its first steps-history record; a REMOVE row carries none.
function isJoin(move) {
  return move.type !== OperationType.REMOVE;
}

function stampOf(params) {
  const first = JSON.parse(params[STEPS_HISTORY_PARAM_INDEX])[0];
  return first && typeof first === 'object' ? first[STAMP_KEY] : undefined;
}

function nullable(value) {
  return value === undefined ? null : value;
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
  // The repository builds the canonical row and the INSERT parameters from the
  // same operation in the same persist call; both are captured so the write
  // can be held to the row owner rather than to a byte string.
  const canonicalRows = [];
  const repository = coordinator.repository;
  const buildReplicaOperationRow =
    repository.buildReplicaOperationRow.bind(repository);
  repository.buildReplicaOperationRow = (operation) => {
    const row = buildReplicaOperationRow(operation);
    canonicalRows.push(row);
    return row;
  };
  const engine = coordinator.sqlQueryEngine;
  const executeQuery = engine.executeQuery.bind(engine);
  engine.executeQuery = async (sql, params) => {
    if (String(sql).includes(INSERT_STATEMENT_FRAGMENT)) {
      inserts.push({
        sql: String(sql),
        params,
        payload: JSON.stringify(params),
        canonicalRow: canonicalRows.at(-1),
      });
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

test('the authorization rides the operation row and rows without it preserve ' +
  'the pre-admission payload', async () => {
  // 1. Every move shape that carries no authorization writes exactly the row
  // owner's canonical row, before this Quest's additive nullable admission
  // columns.
  for (const [name, move] of UNAUTHORIZED_MOVES) {
    const {inserts} = await createOperationCapturingInserts(move);
    assert.equal(inserts.length, 1, `${name} wrote exactly one row`);
    const {sql, params, payload, canonicalRow} = inserts[0];
    assert.equal(sql, REPLICA_OPERATION_INSERT_SQL,
      `${name}: the write is the row owner's INSERT statement`);
    assert.equal(params.length, INSERT_COLUMNS.length,
      `${name}: one parameter per owner column`);
    assert.ok(canonicalRow, `${name}: the row owner built the canonical row`);
    assert.deepEqual(
      PRE_ADMISSION_COLUMNS.map((column) =>
        params[INSERT_COLUMNS.indexOf(column)]),
      PRE_ADMISSION_COLUMNS.map((column) => nullable(canonicalRow[column])),
      `${name}: every pre-admission parameter is the row owner's value`);
    const stamp = stampOf(params);
    assert.equal(stamp !== undefined, isJoin(move),
      `${name}: a join row carries the committed-membership stamp, a REMOVE ` +
      'row none');
    if (stamp !== undefined) {
      assert.deepEqual(Object.keys(stamp).sort(), STAMP_FIELDS,
        `${name}: the stamp carries exactly the answer owner's fields`);
    }
    for (const column of ADMISSION_COLUMNS) {
      assert.equal(params[INSERT_COLUMNS.indexOf(column)], null,
        `${name}: additive CREATE admission column ${column} begins unclaimed`);
    }
    assert.equal(payload.includes(AUTHORIZATION_KEY), false,
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
      junkInserts[0].payload.includes(AUTHORIZATION_KEY), false,
      `an unsanctioned move field (${typeof junk}) stamps nothing`);
  }
});
