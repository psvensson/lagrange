import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {OperationType, createOperation} from '../../src/rebalancer/replica-status.js';
import {NODE_ID, selectRows, withSurface} from './unknown-outcome-surface-fixture.js';

const LEDGER_TABLE = TABLES.REPLICA_OPERATIONS;
const TIMEOUT_MS = 60000;
const logger = {debug() {}, info() {}, warn() {}, error() {}};

function newRepository(engine, gateway, cdcIntegrationService, options = {}) {
  return new ReplicaOperationRepository({
    nodeId: NODE_ID,
    systemTableCache: engine.systemCache,
    controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService,
    logger,
    ...options,
  });
}

function operation(operationId) {
  return Object.assign(createOperation({
    operationId,
    type: OperationType.ADD,
    partitionId: 'user-p1',
    sourceNodeId: NODE_ID,
    targetNodeId: 'other-node',
  }), {entityType: 'partition', entityId: 'user-p1'});
}

const readRows = (of) => selectRows(of(LEDGER_TABLE).dbPath,
  'SELECT operation_id, workflow_step, updated_at FROM replica_operations');

async function observeRejectedInsert(repository, op) {
  try {
    return {result: await repository.persistNewOperation(op)};
  } catch (error) {
    return {error: error.message, code: error.code};
  }
}

test('structured operation writes do not switch to routable SQL when CDC is unavailable',
  {timeout: TIMEOUT_MS}, async () => {
    await withSurface([LEDGER_TABLE], async ({engine, gateway, deliveries, of}) => {
      const repository = newRepository(engine, gateway, null);
      const refused = await observeRejectedInsert(repository, operation('no-cdc'));
      assert.deepEqual({wrote: refused.result === true, deliveries: deliveries.length,
        rows: readRows(of)}, {wrote: false, deliveries: 0, rows: []}, JSON.stringify(refused));
      assert.match(refused.error, /requires cdcIntegrationService/u);
    });
  });

test('a read-only repository cannot use legacy row methods; the canonical writer applies and fences',
  {timeout: TIMEOUT_MS}, async () => {
    await withSurface([LEDGER_TABLE], async ({engine, gateway, deliveries,
      cdcIntegrationService, of}) => {
      const legacyGateway = {
        readAuthoritativeRows: gateway.readAuthoritativeRows.bind(gateway),
        executeQuery: gateway.executeQuery.bind(gateway),
        resolveCdcIntegrationService: () => cdcIntegrationService,
        insertSystemTableRow: gateway.insertSystemTableRow.bind(gateway),
      };
      const reader = newRepository(engine, legacyGateway, cdcIntegrationService);
      const refused = await observeRejectedInsert(reader, operation('legacy-row'));
      assert.deepEqual({wrote: refused.result === true, deliveries: deliveries.length,
        rows: readRows(of)}, {wrote: false, deliveries: 0, rows: []}, JSON.stringify(refused));

      const writer = newRepository(engine, gateway, cdcIntegrationService);
      const prior = operation('canonical-write');
      assert.equal(await writer.persistNewOperation(prior), true);
      const update = {...prior, updatedAt: prior.updatedAt + 1};
      const result = await writer.persistOperationUpdate(update, {
        expectedWorkflowStep: WORKFLOW_STEP.PENDING,
        expectedStepsHistory: prior.stepsHistory,
        confirmPersistence: false,
      });
      assert.equal(result.persisted, true);
      assert.deepEqual(readRows(of), [{
        operation_id: prior.operationId, workflow_step: WORKFLOW_STEP.PENDING,
        updated_at: update.updatedAt,
      }]);
      const attempted = {...update, updatedAt: update.updatedAt + 1};
      const stale = await writer.persistOperationUpdate(attempted, {
        expectedWorkflowStep: WORKFLOW_STEP.PENDING,
        expectedStepsHistory: [],
        confirmPersistence: false,
      });
      assert.equal(stale.persisted, false);
      assert.equal(readRows(of)[0].updated_at, update.updatedAt, 'wrong history cannot alter the row');
    }, {cdc: true});
  });
