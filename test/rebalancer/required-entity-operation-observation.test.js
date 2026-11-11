import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {REPLICA_OPERATION_REPOSITORY_ERROR_CODE} from
  '../../src/rebalancer/replica-operation-repository-constants.js';
import {REBALANCE_COORDINATOR_SHARED} from '../../src/rebalancer/rebalance-coordinator-shared.js';
import {buildReplicaInventorySnapshot} from '../../src/rebalancer/replica-inventory.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';
import {createMockCache, createNodeEndpoint, initializeTestEnvironment} from './unified-rebalancer-test-support.js';

const {REPLICA_OPERATION_VISIBILITY_READ_MODE, REBALANCER_SKIP_REASON} =
  REBALANCE_COORDINATOR_SHARED;
const ENTITY = {entityType: SERVICE_TYPE.PARTITION, entityId: 'replica_operations-p1'};
const REQUIRED = {visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED};
const EMPTY = Object.freeze({state: 'empty', operations: [], operationCount: 0,
  deferredOutcome: null, retryAfterMs: null});
const DEFERRED = Object.freeze({state: 'deferred', operations: [], operationCount: 0,
  deferredOutcome: {completionState: 'operation_visibility_deferred',
    reasonCode: 'operation_visibility_deferred', retryAfterMs: 125}, retryAfterMs: 125});
const REFUSAL = {rebalanceSkipReason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
  ...ENTITY};

// Only external I/O and the node world are controlled. Repository, coordinator,
// strict facade, topology revalidation and inventory are production owners.
function fixture(t, retained = false) {
  initializeTestEnvironment();
  let result = {success: false, rows: [], error: 'finite owner fault'};
  let reads = 0;
  const nodes = ['node-1', 'node-2', 'node-3'].map((nodeId) => ({
    node_id: nodeId, status: 'active', connection_state: 'ready',
    ready_lease_expires_at: Date.now() + 60000,
  }));
  const rows = retained ? [{operation_id: 'held-op', type: OperationType.ADD,
    entity_type: ENTITY.entityType, entity_id: ENTITY.entityId,
    partition_id: ENTITY.entityId, replica_id: `${ENTITY.entityId}-r4`,
    source_node_id: 'node-1', target_node_id: 'node-2', status: 'creating',
    workflow_step: 'CREATING', created_at: Date.now(), updated_at: Date.now()}] : [];
  const cache = createMockCache(nodes, [], [{partition_id: ENTITY.entityId,
    table_id: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, replica_count: 3}], [], rows,
  nodes.map((node) => createNodeEndpoint(node.node_id)));
  const coordinator = createTestCoordinator({nodeId: 'node-1', systemTableCache: cache,
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(table) {
        if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          reads++;
          return result;
        }
        return {success: true, rows: []};
      },
      async executeQuery() {
        return {success: true, rows: []};
      },
    }});
  const rebalancer = createTestRebalancer({nodeId: 'node-1', ...ENTITY,
    systemTableCache: cache, rebalanceCoordinator: coordinator});
  t.teardown(async () => {
    await rebalancer.shutdown(); await coordinator.shutdown();
  });
  return {coordinator, rebalancer, cache, rows,
    setResult(value) {
      result = value;
    }, get reads() {
      return reads;
    }};
}

for (const retained of [false, true]) {
  test(`required operation read preserves finite refusal with retained rows=${retained}`, async (t) => {
    const f = fixture(t, retained);
    const repository = await f.coordinator.repository
      .getOperationsByEntityAuthoritativeObservation(ENTITY.entityType, ENTITY.entityId);
    const observation = await f.coordinator.getEntityAuthoritativeOperationObservation(
      ENTITY.entityType, ENTITY.entityId);
    t.ok(repository.deferredOutcome, 'the actual repository reports unavailable authority');
    t.equal(observation.state, 'deferred',
      'an unanswered read is DEFERRED whatever its projection retains');
    t.equal(observation.complete, false, 'its retained rows are a projection');
    for (const key of ['completionState', 'reasonCode', 'retryAfterMs', 'entityType', 'entityId']) {
      t.equal(observation.deferredOutcome?.[key], repository.deferredOutcome[key],
        `${key} survives the coordinator`);
    }
    t.equal(observation.operationCount, retained ? 1 : 0);
    await t.rejects(f.coordinator.getOperationsByEntity(
      ENTITY.entityType, ENTITY.entityId, REQUIRED), REFUSAL,
    'strict Array extraction cannot discharge deferred visibility');
    const blocker = await f.rebalancer.revalidateCriticalSystemTopologySettlingBlocker(null);
    t.equal(blocker?.reason, 'unavailable', 'actual topology consumer keeps the refusal');
    t.ok(f.reads >= 4, 'all paths used the actual operation read owner');
    f.setResult({success: true, rows: f.rows});
    const recovered = await f.coordinator.getEntityAuthoritativeOperationObservation(
      ENTITY.entityType, ENTITY.entityId);
    t.equal(recovered.deferredOutcome, null);
    t.equal(recovered.state, retained ? 'present' : 'empty');
    t.equal((await f.coordinator.getOperationsByEntity(
      ENTITY.entityType, ENTITY.entityId, REQUIRED)).length, retained ? 1 : 0);
    if (!retained) {
      t.equal(await f.rebalancer.revalidateCriticalSystemTopologySettlingBlocker(null), null,
        'the next real owner attempt releases refusal after the finite fault ends');
    }
  });
}

test('required facade refuses incomplete contracts without ordinary-cache substitution', async (t) => {
  const {coordinator} = fixture(t);
  let cacheReads = 0;
  coordinator.repository.getOperationsByEntity = async () => {
    cacheReads++; return [];
  };
  let pressureClassifications = 0;
  const classifyPressure =
    coordinator.shouldAllowPriorityRecoveryDeferredObservation.bind(coordinator);
  coordinator.shouldAllowPriorityRecoveryDeferredObservation = (...args) => {
    pressureClassifications++;
    return classifyPressure(...args);
  };
  const invalid = [null, {}, {success: true}, {...EMPTY, operations: null},
    {...EMPTY, operationCount: 1}, {...EMPTY, state: 'unknown'},
    {...EMPTY, state: 'present'}, {...EMPTY, deferredOutcome: DEFERRED.deferredOutcome},
    {...DEFERRED, operationCount: 1}, {...DEFERRED, deferredOutcome: null},
    {...DEFERRED, deferredOutcome: {}},
    {...DEFERRED, deferredOutcome: {...DEFERRED.deferredOutcome, retryAfterMs: -1}},
    {...DEFERRED, deferredOutcome: {...DEFERRED.deferredOutcome, completionState: 'unknown'}},
    {...EMPTY, state: 'present', operations: [null], operationCount: 1},
    {...EMPTY, state: 'present', operations: Array(1), operationCount: 1},
    {...EMPTY, state: 'present', operations: [{}], operationCount: 1},
    {...EMPTY, retryAfterMs: undefined}, {...DEFERRED, retryAfterMs: 999}];
  for (const observation of invalid) {
    coordinator.repository.getOperationsByEntityAuthoritativeObservation = async () => observation;
    await t.rejects(coordinator.getOperationsByEntity(ENTITY.entityType, ENTITY.entityId, REQUIRED),
      REFUSAL, `invalid envelope ${JSON.stringify(observation)}`);
    await t.rejects(coordinator.getEntityRecoveryOperationObservation(
      ENTITY.entityType, ENTITY.entityId),
    REFUSAL, 'malformed contracts cannot acquire bounded-pressure permission');
  }
  coordinator.repository.getOperationsByEntityAuthoritativeObservation = undefined;
  await t.rejects(coordinator.getOperationsByEntity(
    ENTITY.entityType, ENTITY.entityId, REQUIRED), REFUSAL);
  coordinator.repository.getOperationsByEntityAuthoritativeObservation = async () => {
    throw Object.assign(new Error('lost answer'), {
      reasonCode: 'owner_transport_lost', retryAfterMs: 37,
    });
  };
  await t.rejects(coordinator.getOperationsByEntity(ENTITY.entityType, ENTITY.entityId, REQUIRED),
    {...REFUSAL, reasonCode: 'owner_transport_lost', retryAfterMs: 37});
  t.equal(pressureClassifications, 0, 'invalid contracts never reach pressure classification');
  t.equal(cacheReads, 0, 'required reads never invoke the ordinary reader');
  coordinator.repository.getOperationsByEntityAuthoritativeObservation = async () => EMPTY;
  t.equal(await coordinator.getEntityAuthoritativeOperationObservation(
    ENTITY.entityType, ENTITY.entityId),
  EMPTY, 'valid envelopes are passed through by identity');
  t.same(await coordinator.getOperationsByEntity(ENTITY.entityType, ENTITY.entityId, REQUIRED), []);
});

test('critical topology refuses missing or malformed required facade answers', async (t) => {
  const {coordinator, rebalancer} = fixture(t);
  for (const answer of [undefined, null, {}, {operations: []}]) {
    coordinator.getOperationsByEntity = answer === undefined ? undefined : async () => answer;
    t.equal((await rebalancer.revalidateCriticalSystemTopologySettlingBlocker(null))?.reason,
      'unavailable');
  }
});

for (const retained of [false, true]) {
  test(`topology guard carries deferred evidence into inventory with rows=${retained}`, async (t) => {
    const {coordinator} = fixture(t, retained);
    let inventory;
    coordinator.replicaInventoryBuilder = (input) => {
      inventory = buildReplicaInventorySnapshot(input);
      return inventory;
    };
    const decision = await coordinator.buildTopologyGuardSnapshot({
      ...ENTITY, partitionId: ENTITY.entityId, normalizedMoveType: OperationType.ADD,
      move: {nodeId: 'node-3', enforceConcurrentOperationBudget: true},
    });
    t.equal(inventory.provenance.topologyIncreaseUsable, false,
      'retained present rows do not erase the unresolved owner read');
    t.equal(decision.admissionResult?.allowed, false);
  });
}

test('replica ID allocation and retired-source safety retain required-read refusal', async (t) => {
  const f = fixture(t);
  // These independent service/in-flight reads succeed. The actual entity
  // operation owner remains failed, distinguishing this boundary's refusal.
  f.coordinator.getEntityInFlightReplicaIds = async () => new Set();
  await t.rejects(f.coordinator.allocateCanonicalReplicaId({
    ...ENTITY, partitionId: ENTITY.entityId,
  }), REFUSAL);
  const move = {...ENTITY, type: OperationType.REPLACE, partitionId: ENTITY.entityId,
    replicaId: `${ENTITY.entityId}-r4`, sourceReplicaId: `${ENTITY.entityId}-r1`,
    sourceNodeId: 'node-1', nodeId: 'node-3'};
  await t.rejects(f.coordinator.getRetiredReplaceSourceMoveSafetyError(move), REFUSAL);
  f.setResult({success: true, rows: []});
  t.match(await f.coordinator.allocateCanonicalReplicaId({...ENTITY, partitionId: ENTITY.entityId}), /-r1$/);
  t.equal(await f.coordinator.getRetiredReplaceSourceMoveSafetyError(move), null);
});

test('malformed gateway members cannot turn into empty or bounded recovery permission', async (t) => {
  const f = fixture(t);
  let classifications = 0;
  f.coordinator.shouldAllowPriorityRecoveryDeferredObservation = () => {
    classifications++;
    return true;
  };
  const missingId = {entity_type: ENTITY.entityType, entity_id: ENTITY.entityId,
    type: OperationType.ADD, status: 'creating', workflow_step: 'CREATING'};
  const valid = {...missingId, operation_id: 'valid-op'};
  for (const rows of [undefined, null, {}, 'empty', [missingId], Array(1),
    [null], [valid, missingId], [valid, null],
    [{...missingId, operation_id: 'wrong-scope', entity_id: 'another-partition'}]]) {
    f.setResult({success: true, rows});
    const expected = {...REFUSAL,
      reasonCode: REPLICA_OPERATION_REPOSITORY_ERROR_CODE.ENTITY_OPERATION_OBSERVATION_MALFORMED};
    await t.rejects(f.coordinator.getOperationsByEntity(
      ENTITY.entityType, ENTITY.entityId, REQUIRED), expected);
    await t.rejects(f.coordinator.getEntityRecoveryOperationObservation(
      ENTITY.entityType, ENTITY.entityId), expected);
    await t.rejects(f.coordinator.getEntityAllocatedOperationReplicaIds(ENTITY), expected);
    await t.rejects(f.coordinator.getEntityRetiredReplaceSourceReplicaIds(ENTITY), expected);
    await t.rejects(f.coordinator.buildTopologyGuardSnapshot({
      ...ENTITY, partitionId: ENTITY.entityId, normalizedMoveType: OperationType.ADD,
      move: {nodeId: 'node-3', enforceConcurrentOperationBudget: true},
    }), expected, 'inventory admission refuses the malformed population');
  }
  t.equal(classifications, 0, 'malformed gateway evidence never reaches the pressure owner');
});

test('malformed retained work cannot disappear into a bounded zero-row observation', async (t) => {
  const f = fixture(t, true);
  let classifications = 0;
  f.coordinator.shouldAllowPriorityRecoveryDeferredObservation = () => {
    classifications++;
    return true;
  };
  delete f.rows[0].operation_id;
  await t.rejects(f.coordinator.getEntityRecoveryOperationObservation(
    ENTITY.entityType, ENTITY.entityId), {...REFUSAL,
    reasonCode: REPLICA_OPERATION_REPOSITORY_ERROR_CODE.ENTITY_OPERATION_OBSERVATION_MALFORMED});
  t.equal(classifications, 0, 'retained malformed work is refused before classification');
});
