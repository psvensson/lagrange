/**
 * Deterministic-intent insert-collision terminal arm.
 *
 * A schema-provisioning creator retries the SAME deterministic
 * move.operationIntentId every attempt. When the durable winner of the
 * insert collision is already terminal, reusing it as an in-flight
 * operation re-drives CREATE_REPLICA against a completed create, misfires
 * completeOperation through the stale cache lane, and loops the terminal
 * transition repair forever while the schema job answers pending (round-10
 * attribution: local lone-seed phase-1 DDL admission livelock, archived
 * runs 06-20-48/06-27-35/06-31-11 on 2026-08-16). A terminal-successful
 * winner IS the create outcome: hand it back untouched, never rearm it,
 * never remember it as an in-flight intent. A terminal-failed winner can
 * never be cured by the same intent id: surface it, do not reuse the
 * corpse. Non-terminal winners keep the CL-008 reuse decision verbatim,
 * as do REPLACE-identity creators (successor generation).
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  applyRebalanceCoordinatorOperationPersistenceCollisionMethods,
} from
  '../../src/rebalancer/rebalance-coordinator-operation-persistence-collision.js';
import {
  isTerminalReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-progress.js';

const PARTITION_ID = 'tbl-deadbeef-p1';
const INTENT_ID = 'schema-job-deadbeef:operation:node-a';

class CollisionHost {}
applyRebalanceCoordinatorOperationPersistenceCollisionMethods(CollisionHost);

function buildHost() {
  const host = new CollisionHost();
  host.calls = {
    rearm: [],
    remember: [],
    successor: [],
    reservation: [],
  };
  host.isRecentOperationIntentTerminal =
    (operation) => isTerminalReplicaOperationRecord(operation);
  host.rememberOperationIntents = (keys, operation) => {
    host.calls.remember.push({keys, operation});
  };
  host.maybeRearmReusedPendingOperation = async (operation) => {
    host.calls.rearm.push(operation);
    return operation;
  };
  host.createSuccessorReplaceOperation = async (context, existing) => {
    host.calls.successor.push({context, existing});
    return {successorOf: existing.operationId};
  };
  host.ensureReservationForOperation = async (operation) => {
    host.calls.reservation.push(operation);
  };
  host.queryExistingOperationAfterInsertConflict = async () => null;
  return host;
}

function buildContext(existing, overrides = {}) {
  return {
    operation: {operationId: INTENT_ID},
    persistResult: {operation: existing},
    move: {operationIntentId: INTENT_ID, nodeId: 'node-a'},
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    normalizedMove: {},
    dedupeKey: 'dedupe-key',
    criticalAddLikeIntentKey: null,
    replaceIntentIdentity: null,
    shouldEmitOperationCreated: false,
    ...overrides,
  };
}

test('a terminal-successful deterministic-intent winner is returned as the ' +
  'create outcome, never rearmed or remembered in-flight', async (t) => {
  const host = buildHost();
  const existing = {
    operationId: INTENT_ID,
    partitionId: PARTITION_ID,
    type: 'ADD',
    status: 'active',
    workflowStep: 'ACTIVE',
    completedAt: 1700000000000,
  };
  const resolved = await host.resolveCreatedOperationPersistenceCollision(
    buildContext(existing),
  );
  t.equal(resolved, existing,
    'the durable terminal-successful winner is the returned operation');
  t.equal(host.calls.rearm.length, 0,
    'a terminal winner is never rearmed as an in-flight operation');
  t.equal(host.calls.remember.length, 0,
    'a terminal winner is never remembered as a reusable in-flight intent');
  t.equal(host.calls.successor.length, 0,
    'no successor generation for a deterministic-intent create');
  t.end();
});

test('a terminal-failed deterministic-intent winner is surfaced, not ' +
  'reused as in-flight', async (t) => {
  const host = buildHost();
  const existing = {
    operationId: INTENT_ID,
    partitionId: PARTITION_ID,
    type: 'ADD',
    status: 'failed',
    workflowStep: 'FAILED',
    completedAt: 1700000000000,
    errorMessage: 'creation failed terminally',
  };
  await t.rejects(
    host.resolveCreatedOperationPersistenceCollision(buildContext(existing)),
    /terminal/i,
    'a terminal-failed winner for the same intent id is a surfaced error, ' +
      'not a reusable in-flight operation',
  );
  t.equal(host.calls.rearm.length, 0,
    'the failed corpse is never rearmed');
  t.equal(host.calls.remember.length, 0,
    'the failed corpse is never remembered as an in-flight intent');
  t.end();
});

test('a non-terminal deterministic-intent winner keeps the CL-008 reuse ' +
  'decision verbatim', async (t) => {
  const host = buildHost();
  const existing = {
    operationId: INTENT_ID,
    partitionId: PARTITION_ID,
    type: 'ADD',
    status: 'pending',
    workflowStep: 'PENDING',
  };
  const resolved = await host.resolveCreatedOperationPersistenceCollision(
    buildContext(existing),
  );
  t.equal(resolved, existing, 'the in-flight winner is reused');
  t.equal(host.calls.rearm.length, 1,
    'the reused pending winner rides the existing rearm decision');
  t.equal(host.calls.remember.length, 1,
    'the reused pending winner is remembered under its intent keys');
  t.end();
});

test('a REPLACE-identity terminal winner still advances the successor ' +
  'generation', async (t) => {
  const host = buildHost();
  host.assertReplaceIntentCollisionMatches = () => {};
  const existing = {
    operationId: 'replace-op-1',
    partitionId: PARTITION_ID,
    type: 'REPLACE',
    status: 'removed',
    workflowStep: 'REMOVED',
    completedAt: 1700000000000,
  };
  const resolved = await host.resolveCreatedOperationPersistenceCollision(
    buildContext(existing, {
      move: {nodeId: 'node-a'},
      replaceIntentIdentity: {intent: 'replace-intent'},
    }),
  );
  t.same(resolved, {successorOf: 'replace-op-1'},
    'REPLACE terminal winners keep successor-generation behavior');
  t.equal(host.calls.successor.length, 1, 'successor path invoked once');
  t.end();
});
