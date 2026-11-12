// Actual persisted REMOVE and cleanup receipt; controlled metadata/transport.
// Fresh handlers are in-process objects, not a process-loss claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {ReplicaStatus, OperationType, OPERATION_METADATA_KEY} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from '../../src/rebalancer/replica-operation-constants.js';
import {createLifecycleServiceRow} from '../test-helpers/lifecycle-state-store.js';
import {completedReceiptWorld, freshHandler, PARTITION, REPLICA, NODE, TABLE} from
  '../rebalancer/replica-remove-cleanup-workflow-fixture.js';
import {REPLICA_CLEANUP_COMPLETION, REPLICA_CLEANUP_ERROR_CODE} from
  '../../src/node/replica-cleanup-constants.js';

const PRE = ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION;

function varyRequest(request, variant) {
  const changed = structuredClone(request);
  if (variant === 'created_at') changed[PRE].created_at += 1000;
  if (variant === 'create_attempt_token') changed[PRE].create_attempt_token += ':other-attempt';
  if (variant === 'replica') {
    changed.replicaId += '-other';
    changed[PRE].service_id = changed.replicaId;
    changed[PRE].replica_id = changed.replicaId;
  }
  if (variant === 'partition') {
    changed.partitionId += '-other';
    changed[PRE].partition_id = changed.partitionId;
  }
  if (variant === 'operation') changed.operationId += '-other';
  if (variant === 'missing_attempt') changed[PRE].create_attempt_token = null;
  return changed;
}

for (const terminal of [false, true]) {
  for (const receiver of ['duplicate', 'fresh']) {
    for (const variant of ['same', 'created_at', 'create_attempt_token']) {
      test(`receipt ingress ${terminal ? 'terminal-release' : 'retained'} ${receiver} ${variant}`, async (t) => {
        const w = await completedReceiptWorld(t, terminal);
        const handler = receiver === 'fresh' ? freshHandler(t, w) : w.handler;
        const request = varyRequest(w.originalRequest, variant);
        const response = await handler.handleRemoveReplica(request);
        const after = w.node.store.durableRow(TABLES.SERVICES, REPLICA);
        assert.deepEqual(w.node.store.durable[TABLES.REPLICA_OPERATIONS]
          .get(w.operation.operationId), w.operationRow, 'original durable operation is unchanged');
        assert.equal(handler.pendingRuntimeShutdowns.size, 0);
        if (variant === 'same') {
          assert.equal(response.status, 'completed');
          assert.deepEqual(after, terminal ? null : w.receipt);
        } else {
          assert.notEqual(response.status, 'completed', 'foreign incarnation must not borrow a completion receipt');
          assert.deepEqual(after, w.receipt, 'foreign request must preserve exact receipt bytes');
        }
      });
    }
  }
}

for (const receiver of ['duplicate', 'fresh']) {
  for (const variant of ['same', 'created_at', 'create_attempt_token', 'replica', 'partition', 'operation', 'missing_attempt']) {
    test(`released absence ingress ${receiver} ${variant}`, async (t) => {
      const w = await completedReceiptWorld(t, true);
      assert.equal((await w.handler.handleRemoveReplica(w.originalRequest)).status, 'completed');
      assert.equal(w.node.store.durableRow(TABLES.SERVICES, REPLICA), null,
        'real owner release established absence before adversarial delivery');
      const handler = receiver === 'fresh' ? freshHandler(t, w) : w.handler;
      const request = varyRequest(w.originalRequest, variant);
      const beforeMutations = w.node.store.mutations.length;
      const response = await handler.handleRemoveReplica(request);
      assert.equal(w.node.store.mutations.length, beforeMutations,
        'absence shortcut does not perform another durable mutation');
      assert.deepEqual(w.node.store.durable[TABLES.REPLICA_OPERATIONS]
        .get(w.operation.operationId), w.operationRow, 'original durable operation is unchanged');
      if (variant === 'same') assert.equal(response.status, 'completed');
      else assert.notEqual(response.status, 'completed',
        'terminal operation must bind the exact requested target and incarnation');
    });
  }
}

for (const atRead of ['before', 'during-operation-read']) {
  test(`released receipt successor preserved ${atRead}`, async (t) => {
    const w = await completedReceiptWorld(t, true);
    assert.equal((await w.handler.handleRemoveReplica(w.originalRequest)).status, 'completed');
    const handler = freshHandler(t, w);
    let closes = 0;
    let fences = 0;
    const successor = {replicaId: REPLICA, partitionId: PARTITION, nodeId: NODE,
      async shutdown() {closes++;}, fenceServingAdmissionForRemoval() {fences++;}};
    const successorRow = createLifecycleServiceRow({replicaId: REPLICA,
      partitionId: PARTITION, nodeId: NODE, status: ReplicaStatus.ACTIVE,
      createdAt: w.receipt.created_at + 2000, createAttemptToken: 'successor-attempt'});
    handler.registerExistingReplica({replicaId: REPLICA, partitionId: PARTITION,
      tableName: TABLE, status: ReplicaStatus.ACTIVE, service: successor});
    const originalLocal = handler.getLocalReplica(REPLICA);
    fs.mkdirSync(path.dirname(w.dbPath), {recursive: true});
    fs.writeFileSync(w.dbPath, 'successor bytes');
    if (atRead === 'before') {
      await w.node.store.gateway.insertSystemTableRow(TABLES.SERVICES, successorRow);
    } else {
      w.node.store.setBeforeAuthoritativeRead((table, _params, durable) => {
        if (table === TABLES.REPLICA_OPERATIONS) {
          durable[TABLES.SERVICES].set(REPLICA, successorRow);
        }
      });
    }
    const response = await handler.handleRemoveReplica(w.originalRequest);
    w.node.store.setBeforeAuthoritativeRead(null);
    assert.notEqual(response.status, 'completed');
    assert.equal(handler.getTrackedService(REPLICA), successor);
    assert.equal(handler.getLocalReplica(REPLICA), originalLocal);
    assert.equal(handler.getLocalReplica(REPLICA).status, ReplicaStatus.ACTIVE);
    assert.equal(closes, 0);assert.equal(fences, 0);
    assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'successor bytes');
    assert.deepEqual(w.node.store.durableRow(TABLES.SERVICES, REPLICA), successorRow);
  });
}

const STAGES = ['retained', 'terminal', 'absent'];
const PRECONDITION_CHANGES = {
  service_id: 'another-service', replica_id: 'another-replica',
  service_type: SERVICE_TYPE.PARTITION_CLEANUP, group_id: 'another-group',
  partition_id: 'another-partition', node_id: 'another-node', status: ReplicaStatus.ACTIVE,
  cleanup_token: 'failed-create:another-create', created_at: 999,
  create_attempt_token: 'another-attempt', state_entered_at: 999,
};

async function ingressStage(t, stage) {
  const w = await completedReceiptWorld(t, stage !== 'retained');
  if (stage === 'absent') {
    assert.equal((await w.handler.handleRemoveReplica(w.originalRequest)).status, 'completed');
    assert.equal(w.node.store.durableRow(TABLES.SERVICES, REPLICA), null);
  }
  return w;
}

function retainedFacts(w, handler) {
  const owner = handler.getReplicaCleanupTombstoneOwner();
  return {
    receipt: w.node.store.durableRow(TABLES.SERVICES, REPLICA),
    mutations: w.node.store.mutations.length,
    continuation: owner.readRemovalContinuation(REPLICA, PARTITION, NODE),
    lifecycleSize: handler.replicaStateMachine.replicas.size,
    pendingSize: handler.pendingRuntimeShutdowns.size,
  };
}

function assertRetainedFacts(w, handler, before) {
  assert.deepEqual(w.node.store.durableRow(TABLES.SERVICES, REPLICA), before.receipt);
  assert.equal(w.node.store.mutations.length, before.mutations);
  assert.deepEqual(handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(REPLICA, PARTITION, NODE), before.continuation);
  assert.equal(handler.replicaStateMachine.replicas.size, before.lifecycleSize);
  assert.equal(handler.pendingRuntimeShutdowns.size, before.pendingSize);
}

for (const stage of STAGES) {
  for (const [field, value] of Object.entries(PRECONDITION_CHANGES)) {
    for (const missing of [false, true]) {
      test(`canonical request identity ${stage}: ${missing ? 'missing' : 'foreign'} ${field}`, async (t) => {
        const w = await ingressStage(t, stage);
        const handler = freshHandler(t, w);
        const request = structuredClone(w.originalRequest);
        if (missing) delete request[PRE][field];
        else request[PRE][field] = value;
        const before = retainedFacts(w, handler);
        const answer = await handler.handleRemoveReplica(request);
        assert.equal(answer.status, 'error');
        assert.equal(answer.errorCode, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
        assertRetainedFacts(w, handler, before);
      });
    }
  }
  for (const [field, value] of Object.entries({operationType: OperationType.ADD,
    entityType: SERVICE_TYPE.PARTITION_CLEANUP, entityId: 'other-entity'})) {
    test(`canonical request envelope ${stage}: foreign ${field}`, async (t) => {
      const w = await ingressStage(t, stage);
      const handler = freshHandler(t, w);
      const before = retainedFacts(w, handler);
      const answer = await handler.handleRemoveReplica({...w.originalRequest, [field]: value});
      assert.equal(answer.errorCode, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
      assertRetainedFacts(w, handler, before);
    });
  }
  test(`canonical request receiver ${stage}: foreign node`, async (t) => {
    const w = await ingressStage(t, stage);
    const handler = freshHandler(t, w, 'other-node');
    const request = structuredClone(w.originalRequest);
    request[PRE].node_id = 'other-node';
    const before = retainedFacts(w, handler);
    const answer = await handler.handleRemoveReplica(request);
    assert.equal(answer.errorCode, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    assertRetainedFacts(w, handler, before);
  });
}

function mutateOriginalPrecondition(row, change) {
  const history = JSON.parse(row.steps_history);
  change(history[0][OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION]);
  row.steps_history = JSON.stringify(history);
}

const MALFORMED_OPERATION = {
  missing_type: (row) => {delete row.type;},
  wrong_type: (row) => {row.type = OperationType.ADD;},
  wrong_replica: (row) => {row.replica_id += ':other';},
  wrong_partition: (row) => {row.partition_id += ':other';},
  wrong_node: (row) => {row.target_node_id += ':other';},
  wrong_entity_type: (row) => {row.entity_type = SERVICE_TYPE.PARTITION_CLEANUP;},
  wrong_entity_id: (row) => {row.entity_id += ':other';},
  wrong_status: (row) => {row.status = ReplicaStatus.ACTIVE;},
  wrong_step: (row) => {row.workflow_step = 'unknown';},
  missing_completed_at: (row) => {delete row.completed_at;},
  invalid_completed_at: (row) => {row.completed_at = 'not-a-timestamp';},
  missing_history: (row) => {delete row.steps_history;},
  malformed_history: (row) => {row.steps_history = '{';},
  wrong_history_shape: (row) => {row.steps_history = '{}';},
  missing_original: (row) => {row.steps_history = '[]';},
  missing_birth: (row) => {mutateOriginalPrecondition(row, (pre) => {delete pre.created_at;});},
  missing_attempt: (row) => {
    mutateOriginalPrecondition(row, (pre) => {delete pre.create_attempt_token;});
  },
  missing_version: (row) => {
    mutateOriginalPrecondition(row, (pre) => {delete pre.state_entered_at;});
  },
  missing_group: (row) => {mutateOriginalPrecondition(row, (pre) => {delete pre.group_id;});},
  bad_original_status: (row) => {
    mutateOriginalPrecondition(row, (pre) => {pre.status = ReplicaStatus.ACTIVE;});
  },
  bad_original_token: (row) => {
    mutateOriginalPrecondition(row, (pre) => {pre.cleanup_token = null;});
  },
};

for (const stage of STAGES) {
  for (const [name, corrupt] of Object.entries(MALFORMED_OPERATION)) {
    test(`malformed durable operation ${stage}: ${name} refuses and heals`, async (t) => {
      const w = await ingressStage(t, stage);
      const handler = freshHandler(t, w);
      const malformed = structuredClone(w.operationRow);
      corrupt(malformed);
      const operations = w.node.store.durable[TABLES.REPLICA_OPERATIONS];
      operations.set(w.operation.operationId, malformed);
      const before = retainedFacts(w, handler);
      const answer = await handler.handleRemoveReplica(w.originalRequest);
      assert.equal(answer.status, 'error');
      assert.equal(answer.errorCode, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED);
      assert.equal(answer.deferRetry, true);
      assertRetainedFacts(w, handler, before);
      operations.set(w.operation.operationId, w.operationRow);
      assert.equal((await handler.handleRemoveReplica(w.originalRequest)).status, 'completed',
        'restored original authority completes through the same ingress');
    });
  }
  for (const unavailable of ['missing', 'read-unavailable', 'duplicate']) {
    test(`unavailable durable operation ${stage}: ${unavailable} retains exact receipt`, async (t) => {
      const w = await ingressStage(t, stage);
      const handler = freshHandler(t, w);
      await handler.awaitRemovedReplicaCleanupAdmissionBarrier();
      const operations = w.node.store.durable[TABLES.REPLICA_OPERATIONS];
      if (unavailable === 'missing') operations.delete(w.operation.operationId);
      if (unavailable === 'duplicate') operations.set('duplicate', structuredClone(w.operationRow));
      let engaged = false;
      if (unavailable === 'read-unavailable') {
        w.node.store.setBeforeAuthoritativeRead((table) => {
          if (table === TABLES.REPLICA_OPERATIONS) {
            engaged = true;
            w.node.store.setAuthoritativeReadAvailable(false);
          }
        });
      }
      const before = retainedFacts(w, handler);
      const answer = await handler.handleRemoveReplica(w.originalRequest);
      if (unavailable === 'read-unavailable') assert.equal(engaged, true);
      assert.equal(answer.errorCode, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED);
      assert.equal(answer.deferRetry, true);
      assertRetainedFacts(w, handler, before);
      w.node.store.setBeforeAuthoritativeRead(null);
      w.node.store.setAuthoritativeReadAvailable(true);
      operations.delete('duplicate');
      operations.set(w.operation.operationId, w.operationRow);
      assert.equal((await handler.handleRemoveReplica(w.originalRequest)).status, 'completed');
    });
  }
}

for (const terminal of [false, true]) {
  test(`cleanup owner returns explicit same-incarnation completion: terminal ${terminal}`, async (t) => {
    const w = await completedReceiptWorld(t, terminal);
    const owner = w.handler.getReplicaCleanupTombstoneOwner();
    const decision = await owner.resolveFailedCreateCompletion({...w.originalRequest,
      nodeId: NODE, precondition: w.originalRequest[PRE]});
    assert.equal(decision.outcome, terminal ? REPLICA_CLEANUP_COMPLETION.RECEIPT_RELEASED :
      REPLICA_CLEANUP_COMPLETION.RECEIPT_RETAINED);
    assert.equal((await w.handler.handleRemoveReplica(w.originalRequest)).status, 'completed');
  });
}

for (const variant of ['same', 'nonterminal', 'foreign-birth', 'foreign-attempt', 'malformed', 'missing']) {
  test(`startup frozen receipt uses canonical operation binding: ${variant}`, async (t) => {
    const w = await completedReceiptWorld(t, variant !== 'nonterminal');
    const handler = freshHandler(t, w);
    const owner = handler.getReplicaCleanupTombstoneOwner();
    const snapshot = await owner.snapshotPersistedAtStartup(NODE);
    const changed = structuredClone(w.operationRow);
    if (variant === 'foreign-birth') mutateOriginalPrecondition(changed, (pre) => {pre.created_at += 1000;});
    if (variant === 'foreign-attempt') mutateOriginalPrecondition(changed, (pre) => {pre.create_attempt_token += ':other';});
    if (variant === 'malformed') delete changed.completed_at;
    w.node.store.durable[TABLES.REPLICA_OPERATIONS].set(w.operation.operationId, changed);
    if (variant === 'missing') w.node.store.durable[TABLES.REPLICA_OPERATIONS].delete(w.operation.operationId);
    fs.mkdirSync(path.join(handler.dataDir, 'partitions'), {recursive: true});
    const result = await handler.sweepRemovedReplicaCleanupDebt(snapshot);
    assert.equal(result.candidates, 1);
    assert.equal(result.deleted, variant === 'same' ? 1 : 0);
    assert.equal(result.failed, variant === 'same' ? 0 : 1);
    assert.deepEqual(w.node.store.durableRow(TABLES.SERVICES, REPLICA), variant === 'same' ? null : w.receipt);
    assert.equal(snapshot.get(REPLICA).ownerToken, w.receipt.cleanup_token);
  });
}
