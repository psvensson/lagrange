// DT for A1 (quest routed-mutation-silent-ledger-write-loss): a single-partition
// ledger progress write must NOT open a spurious 2PC participant BEGIN IMMEDIATE.
// The engine skips enlistParticipants when the rebalancer sets
// `bypassSingleParticipantSystemWrite` AND the write resolved to exactly one
// partition POST-mirror — so a SPLIT_CUTOVER (2-participant) write still enlists
// full 2PC. Paired with an allowlist-threading assertion because the flag rides
// the control-plane gateway allowlist (buildGatewayWriteOptions), which silently
// drops unknown fields — an engine-only test would pass even if the flag never
// arrives (the a9344058 "green DT for a path the system never takes" trap).
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  buildGatewayWriteOptions,
} from '../../src/control-plane/control-plane-system-table-gateway-options.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
ConfigurationManager.getInstance().initialize();
import {
  createMockMessageRouter,
  createMockSystemCache,
} from './sql-query-engine-test-support.js';

function buildEngineHarness({partitionIds, enlistCalls}) {
  const cache = createMockSystemCache(
    [{table_name: 'users', primaryKey: 'id'}],
    partitionIds.map((partitionId) => ({
      partition_id: partitionId,
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
    })),
  );
  const transactionCoordinator = {
    getTransaction(sessionId) {
      return sessionId === 'tx-ledger-1' ? {participants: []} : null;
    },
    async enlistParticipants(sessionId, partitions) {
      enlistCalls.push({sessionId, partitions});
      return {success: true};
    },
    async recordWriteOperation() {},
    async markWriteOperationResult() {},
  };
  const executePlanCalls = [];
  const distributedWriteCoordinator = {
    createWritePlan() {
      return {
        operationId: 'write-ledger-1',
        idempotencyKey: 'write-ledger-1',
        statementType: 'UPDATE',
        partitionStatements: new Map(
          partitionIds.map((partitionId) => [
            partitionId,
            {
              ast: {type: 'UPDATE', table: 'users'},
              role: 'primary',
              executionOptions: {},
            },
          ]),
        ),
      };
    },
    async executePlan(_plan, _params, executionOptions = {}) {
      executePlanCalls.push({...executionOptions});
      return {success: true, affectedRows: 1, rows: [], retryCount: 0};
    },
  };
  const engine = new SQLQueryEngine({
    systemCache: cache,
    messageRouter: createMockMessageRouter(),
    transactionCoordinator,
    distributedWriteCoordinator,
  });
  return {engine, executePlanCalls};
}

test('A1 - single-partition write with the bypass flag skips 2PC enlist but ' +
  'still applies the write', async (t) => {
  const enlistCalls = [];
  const {engine, executePlanCalls} = buildEngineHarness({
    partitionIds: ['p1'],
    enlistCalls,
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
    [],
    {sessionId: 'tx-ledger-1', bypassSingleParticipantSystemWrite: true},
  );

  t.equal(result.success, true, 'the write still succeeds');
  t.equal(enlistCalls.length, 0,
    'no participant enlist (no spurious BEGIN IMMEDIATE) for a ' +
    'single-partition flagged write');
  t.equal(executePlanCalls.length, 1,
    'the write is still executed against its partition');
  t.end();
});

test('A1 - a multi-partition (SPLIT_CUTOVER) write still enlists 2PC even with ' +
  'the bypass flag', async (t) => {
  const enlistCalls = [];
  const {engine} = buildEngineHarness({
    partitionIds: ['p1', 'p2'],
    enlistCalls,
  });

  const result = await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
    [],
    {sessionId: 'tx-ledger-1', bypassSingleParticipantSystemWrite: true},
  );

  t.equal(result.success, true, 'the write succeeds');
  t.equal(enlistCalls.length, 1,
    'a genuinely multi-partition (post-mirror length > 1) write must keep ' +
    'full 2PC — the flag only bypasses single-participant writes');
  t.end();
});

test('A1 - a single-partition write WITHOUT the flag still enlists 2PC ' +
  '(the flag is the sole trigger)', async (t) => {
  const enlistCalls = [];
  const {engine} = buildEngineHarness({
    partitionIds: ['p1'],
    enlistCalls,
  });

  await engine.executeQuery(
    'UPDATE users SET status = \'active\' WHERE id = \'alice\'',
    [],
    {sessionId: 'tx-ledger-1'},
  );

  t.equal(enlistCalls.length, 1,
    'without the flag, a transactional single-partition write enlists as before');
  t.end();
});

test('A1 - the bypass flag survives the control-plane gateway allowlist ' +
  '(buildGatewayWriteOptions must not drop it)', async (t) => {
  const gateway = {now: () => 1000};

  const withFlag = buildGatewayWriteOptions(
    gateway,
    {bypassSingleParticipantSystemWrite: true},
    {tableName: 'replica_operations', operationKind: 'update'},
  );
  t.equal(withFlag.bypassSingleParticipantSystemWrite, true,
    'the allowlist forwards the flag to the engine query options');

  const withoutFlag = buildGatewayWriteOptions(
    gateway,
    {},
    {tableName: 'replica_operations', operationKind: 'update'},
  );
  t.notOk(withoutFlag.bypassSingleParticipantSystemWrite,
    'the flag is absent when the caller does not set it');
  t.end();
});
