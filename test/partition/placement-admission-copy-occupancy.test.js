// Copy occupancy is one classification over canonical operation semantics,
// consumed by both PLACEMENT_ADMIT capacity and PLACEMENT_RELEASE_HOLD
// (quest replica-placement-admission-owner, design section 2.5 step 7 and
// "The ledger's own transition"; independent review 2026-11-18 finding 4),
// and the applier runs only at the canonical ledger partition (design section
// 2.2: the owner and every admission live on replica_operations-p1).
//
// A runtime-service start performs no group copy (design section 1.1 S6: "no
// group copy"; section 2.9: "no copy capacity"), so its null copy source is
// the named state NOT_A_COPY: it occupies neither a source nor a target and
// never delays the ledger hold. A partition copy whose copy source is not
// recorded (a row written by a pre-cutover creator) is the named state
// UNRECORDED and occupies every source (step 7).
//
// REAL: the replica_operations PartitionService, its committed apply path and
// SQLite ledger. DOUBLE: the consensus port (the test commits).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {applyPlacementCommand, requestPlacementAdmission,
  requestPlacementHoldRelease} from '../../src/partition/partition-placement-admission.js';
import {buildPlacementCommand} from
  '../../src/partition/partition-placement-admission-command.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {canonicalPlacementStatement} from
  '../../src/rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_CLASS, PLACEMENT_COPY_CAPACITY, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL,
  PLACEMENT_TRANSITION_KIND} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  shutdownAll, startLeader, track} from '../test-helpers/participant-transaction-fixture.js';
import {
  LEDGER_PARTITION_ID, NODE, admitOnLeader, commitLedgerStatement, foundingStatement,
  ledgerRows, onLedgerLeader, placementStatement, stepLedgerRow,
} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];
const SPLIT_LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p2`;

// The runtime-service owner's statement of one service start (design
// section 2.5: transitionKind RUNTIME_SERVICE, no copy source).
function runtimeServiceStatement(serviceId, targetNodeId, ordinal = 1) {
  const canonical = canonicalPlacementStatement({
    transitionKind: PLACEMENT_TRANSITION_KIND.RUNTIME_SERVICE,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, entityId: serviceId,
    partitionId: serviceId, placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
    kSrcForClass: PLACEMENT_COPY_CAPACITY.K_SRC, dispatchHold: null,
    formationLatchEpoch: 4, foundingIntentId: null, sourceNodeId: NODE.A,
    membershipPublicationEpoch: null, positions: {ledgerAppliedIndex: 1},
    moves: [{type: OperationType.ADD, targetNodeId, replicaId: `${serviceId}-r${ordinal}`,
      sourceReplicaId: null, copySourceNodeId: null, targetNodeBootIncarnation: null,
      targetNodeStorageIncarnation: null}],
  });
  assert.equal(canonical.validity, 'valid');
  return canonical.statement;
}

async function admitRuntimeServices(leader, proposed, targets) {
  const operationIds = [];
  for (const [index, target] of targets.entries()) {
    const admitted = await admitOnLeader(leader, proposed, `svc-${index}`,
      runtimeServiceStatement(`svc-${index}`, target));
    assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    operationIds.push(...resultOf(admitted.answer).operationIds);
  }
  // Each pending start carries the null copy source the statement requires.
  for (const row of ledgerRows(leader).filter((entry) =>
    operationIds.includes(entry.operation_id))) {
    assert.equal(row.entity_type, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
    assert.equal(row.copy_source_node_id, null);
    assert.equal(row.workflow_step, WORKFLOW_STEP.PENDING);
  }
  return operationIds;
}

test('pending runtime-service starts occupy no source budget; genuine partition ' +
  'copies of the same source do', () => onLedgerLeader(async (leader, proposed) => {
  // K_src (3) pending runtime-service starts, on targets other than node-b.
  await admitRuntimeServices(leader, proposed, [NODE.C, NODE.D, NODE.A]);
  const first = await admitOnLeader(leader, proposed, 'copy-0',
    placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  assert.deepEqual(resultOf(first.answer).outcome, PLACEMENT_OUTCOME.ADMITTED,
    JSON.stringify(resultOf(first.answer)));
  // Two more genuine copies from node-a fill its K_src with copies only.
  for (const [index, [partitionId, target]] of [['indices-p1', NODE.C],
    ['config-p1', NODE.D]].entries()) {
    const admitted = await admitOnLeader(leader, proposed, `copy-${index + 1}`,
      placementStatement({partitionId, target}));
    assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED,
      JSON.stringify(resultOf(admitted.answer)));
  }
  const full = await admitOnLeader(leader, proposed, 'copy-3',
    placementStatement({partitionId: 'services-p1', target: NODE.D}));
  assert.equal(resultOf(full.answer).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
  // The occupancy names the three copies; the runtime-service starts are absent.
  assert.equal(resultOf(full.answer).occupancy.sourceOccupancy, 3);
  // Another source is unaffected by the runtime-service starts.
  const otherSource = await admitOnLeader(leader, proposed, 'copy-4',
    placementStatement({partitionId: 'partitions-p1', target: NODE.C, source: NODE.B}));
  assert.equal(resultOf(otherSource.answer).outcome, PLACEMENT_OUTCOME.ADMITTED,
    JSON.stringify(resultOf(otherSource.answer)));
}));

test('pending runtime-service starts on a target occupy no target budget; genuine ' +
  'copies to it do', () => onLedgerLeader(async (leader, proposed) => {
  // K_tgt (2) pending runtime-service starts on node-b.
  await admitRuntimeServices(leader, proposed, [NODE.B, NODE.B]);
  const first = await admitOnLeader(leader, proposed, 'copy-0',
    placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  assert.equal(resultOf(first.answer).outcome, PLACEMENT_OUTCOME.ADMITTED,
    JSON.stringify(resultOf(first.answer)));
  const second = await admitOnLeader(leader, proposed, 'copy-1',
    placementStatement({partitionId: 'indices-p1', target: NODE.B}));
  assert.equal(resultOf(second.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
  const full = await admitOnLeader(leader, proposed, 'copy-2',
    placementStatement({partitionId: 'config-p1', target: NODE.B}));
  assert.equal(resultOf(full.answer).reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
  assert.deepEqual(resultOf(full.answer).occupancy, {copySourceNodeId: NODE.A,
    sourceOccupancy: 2, sourceLimit: 3, targetNodeId: NODE.B, targetOccupancy: 2,
    targetLimit: 2});
}));

test('a partition copy without a recorded copy source occupies every source; a ' +
  'runtime-service start without one occupies none', () =>
  onLedgerLeader(async (leader, proposed) => {
    await admitRuntimeServices(leader, proposed, [NODE.C, NODE.C]);
    const copy = await admitOnLeader(leader, proposed, 'copy-0',
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
    assert.equal(resultOf(copy.answer).outcome, PLACEMENT_OUTCOME.ADMITTED,
      JSON.stringify(resultOf(copy.answer)));
    // The partition copy's source is unrecorded (a pre-cutover creator's row).
    const [copyId] = resultOf(copy.answer).operationIds;
    assert.equal(commitLedgerStatement(leader, 'unrecord-source',
      'UPDATE replica_operations SET copy_source_node_id = NULL WHERE operation_id = ?',
      [copyId]), null);
    const otherSource = await admitOnLeader(leader, proposed, 'copy-1',
      placementStatement({partitionId: 'indices-p1', target: NODE.D, source: NODE.D}));
    assert.equal(resultOf(otherSource.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    const probe = await admitOnLeader(leader, proposed, 'copy-2',
      placementStatement({partitionId: 'config-p1', target: NODE.A, source: NODE.D,
        repairWaitingOn: [NODE.D]}));
    // node-d: its own copy plus the unrecorded copy (2) reach K_src - 1; the
    // two runtime-service starts are not counted.
    assert.equal(resultOf(probe.answer).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
    assert.equal(resultOf(probe.answer).occupancy.sourceOccupancy, 2);
  }));

test('the engaged ledger hold waits on genuine partition copies only, never on ' +
  'runtime-service starts or founding creates', () =>
  onLedgerLeader(async (leader, proposed) => {
    const services = await admitRuntimeServices(leader, proposed, [NODE.B]);
    const founding = await admitOnLeader(leader, proposed, 'found-1',
      foundingStatement('tbl-orders-p1', [NODE.A, NODE.B, NODE.C]));
    assert.equal(resultOf(founding.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    const copy = await admitOnLeader(leader, proposed, 'copy-1',
      placementStatement({partitionId: 'tables-p1', target: NODE.D}));
    const ledger = await admitOnLeader(leader, proposed, 'ledger-1', placementStatement({
      partitionId: LEDGER_PARTITION_ID, placementClass: PLACEMENT_CLASS.LEDGER,
      type: OperationType.REPLACE, target: NODE.C,
      sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`}));
    assert.equal(resultOf(ledger.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    const [ledgerOperationId] = resultOf(ledger.answer).operationIds;
    const release = async (entryId) => {
      const pending = track(requestPlacementHoldRelease(leader,
        {entryId, body: {operationId: ledgerOperationId}}));
      const command = await awaitProposal(proposed, (entry) => entry.entryId === entryId);
      assert.equal(applyCommitted(leader, command), null);
      return resultOf(await pending.promise);
    };
    // Only the partition copy is named; the pending runtime-service start and
    // the pending founders are not copy-phase occupancy.
    assert.deepEqual(await release('release-1'), {outcome: PLACEMENT_OUTCOME.REFUSED,
      reason: PLACEMENT_REFUSAL.COPY_PHASE_NOT_IDLE,
      operationIds: resultOf(copy.answer).operationIds});
    assert.equal(stepLedgerRow(leader, resultOf(copy.answer).operationIds[0],
      WORKFLOW_STEP.ACTIVE), null);
    const rows = ledgerRows(leader);
    assert.ok([...services, ...resultOf(founding.answer).operationIds].every((id) =>
      rows.find((row) => row.operation_id === id).workflow_step === WORKFLOW_STEP.PENDING));
    assert.deepEqual(await release('release-2'), {outcome: PLACEMENT_OUTCOME.RELEASED,
      operationIds: [ledgerOperationId]});
  }));

// The canonical ledger boundary (design section 2.2): an admission on any
// other replica_operations partition is refused typed at request and at apply,
// before any census of that partition's local rows.
test('PLACEMENT_ADMIT off the canonical ledger partition is refused typed at request ' +
  'and at apply, never decided over a local ledger', async () => {
  const {leader, proposed} = await startLeader({tableName:
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, schema: REPLICA_OPERATIONS_SCHEMA},
  SPLIT_LEDGER_PARTITION_ID);
  try {
    const body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const atRequest = await requestPlacementAdmission(leader, {entryId: 'split-1', body});
    assert.equal(atRequest.success, false);
    assert.equal(atRequest.failureCode, PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED);
    assert.equal(proposed.length, 0);
    // A command committed past the request check meets the same boundary.
    const command = buildPlacementCommand(leader, {type: 'PLACEMENT_ADMIT',
      entryId: 'split-2', body});
    assert.equal(applyCommitted(leader, command), null);
    assert.deepEqual(JSON.parse(readCommittedStatementOutcome(leader,
      leader.getCommittedEntryKey(command)).ownerResultText),
    {outcome: PLACEMENT_OUTCOME.REFUSED, reason: PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED,
      partitionId: SPLIT_LEDGER_PARTITION_ID, ledgerPartitionId: LEDGER_PARTITION_ID});
    assert.equal(ledgerRows(leader).length, 0);
    const release = buildPlacementCommand(leader, {type: 'PLACEMENT_RELEASE_HOLD',
      entryId: 'split-3', body: {operationId: 'pl-replica_operations-p1-9-0'}});
    assert.equal(applyCommitted(leader, release), null);
    assert.equal(JSON.parse(readCommittedStatementOutcome(leader,
      leader.getCommittedEntryKey(release)).ownerResultText).reason,
    PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED);
    assert.equal(typeof applyPlacementCommand, 'function');
  } finally {
    await shutdownAll(leader);
  }
});
