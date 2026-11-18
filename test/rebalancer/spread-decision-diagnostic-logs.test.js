/**
 * The two info-level spread diagnostics (no behavior):
 *  - one line per CHANGED priority spread plan decision, carrying the
 *    cure-condition evidence and whether the chosen REPLACE source leads;
 *  - one line when the operation-ledger quorum-spread hold is evaluated and
 *    does not engage: on the first evaluation and on change only, with the
 *    ready node ids and the ledger voter rows.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  logOperationLedgerQuorumSpreadHoldNotEngaged,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {createTestRebalancer} from './test-helpers.js';

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const SEED_NODE_ID = 'node-seed';
const JOINER_NODE_ID = 'node-joiner-a';

function ledgerRow(suffix, nodeId) {
  return {
    service_id: `${LEDGER_PARTITION_ID}-${suffix}`,
    replica_id: `${LEDGER_PARTITION_ID}-${suffix}`,
    partition_id: LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
  };
}

function capturingLogger(lines) {
  const capture = (level) => (message, fields) =>
    lines.push({level, message, fields});
  return {info: capture('info'), debug() {}, warn: capture('warn'),
    error: capture('error')};
}

test('plan decision: one info line per changed priority spread decision, ' +
  'with the cure evidence and the chosen source\'s leadership', (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const rows = ['r1', 'r2', 'r3'].map((suffix) =>
    ledgerRow(suffix, SEED_NODE_ID));
  const rebalancer = createTestRebalancer({
    entityId: LEDGER_PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: SEED_NODE_ID,
    cacheData: {
      nodes: [SEED_NODE_ID, JOINER_NODE_ID].map((nodeId) =>
        ({node_id: nodeId, status: 'active'})),
      services: rows,
      partitions: [{partition_id: LEDGER_PARTITION_ID,
        table_id: 'replica_operations', leader_node_id: SEED_NODE_ID,
        replica_count: 3}],
      replicaOperations: [],
    },
  });
  const lines = [];
  rebalancer.replicaId = `${LEDGER_PARTITION_ID}-r1`;
  rebalancer.initialize();
  rebalancer.setLeader(true);
  rebalancer.movePlanner.logger = capturingLogger(lines);
  const targetState = {targetReplicaCount: 3,
    targetNodes: [SEED_NODE_ID, SEED_NODE_ID, JOINER_NODE_ID],
    availableNodeCount: 2};
  rebalancer.calculateMoves(rows, targetState);
  rebalancer.calculateMoves(rows, targetState);
  rebalancer.shutdown();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const decisions = lines.filter((line) =>
    line.message === REBALANCER_LOG_MSG.PRIORITY_SPREAD_PLAN_DECISION);
  t.equal(decisions.length, 1,
    'an unchanged decision is logged once, not once per planning pass');
  const [{level, fields}] = decisions;
  t.equal(level, 'info', 'at info level');
  t.equal(fields.entityId, LEDGER_PARTITION_ID, 'it names the partition');
  for (const field of ['inFlightReplaceCount', 'naturalReplaceCount',
    'addMoveCount', 'occupiedReplicaCount', 'deficitEffectiveCount',
    'voterReplicaCount', 'activeReplicaCount', 'targetReplicaCount',
    'targetDistinctNodeCount', 'activeDistinctNodeCount']) {
    t.equal(typeof fields[field], 'number', `cure evidence: ${field}`);
  }
  t.equal(fields.plannedReplaceCount, 1, 'the plan is one REPLACE');
  t.equal(fields.replaceSourceReplicaId, `${LEDGER_PARTITION_ID}-r2`,
    'it names the chosen source');
  t.equal(fields.sourceIsLeader, false, 'which is not the leader');
  t.equal(fields.plannerHoldsLeadership, true,
    'decided from the planner\'s own leadership');
  t.end();
});

test('quorum-spread hold not engaged: logged on the first evaluation and ' +
  'on change only, with ready nodes and ledger voter rows', (t) => {
  const tables = {
    services: [ledgerRow('r1', SEED_NODE_ID), ledgerRow('r2', SEED_NODE_ID),
      ledgerRow('r3', SEED_NODE_ID)],
    nodes: [{node_id: SEED_NODE_ID, connection_state: 'ready'}],
    partitions: [],
  };
  const cache = {
    filter: (tableName, predicate) =>
      (tables[tableName] || []).filter(predicate),
  };
  const lines = [];
  const logger = capturingLogger(lines);
  const message = REBALANCE_COORDINATOR_LOG_MSG
    .OPERATION_LEDGER_QUORUM_SPREAD_HOLD_NOT_ENGAGED;
  let key = logOperationLedgerQuorumSpreadHoldNotEngaged(
    logger, message, cache, undefined);
  key = logOperationLedgerQuorumSpreadHoldNotEngaged(
    logger, message, cache, key);
  t.equal(lines.length, 1, 'the same evidence is logged once');
  t.equal(lines[0].level, 'info', 'at info level');
  t.same(lines[0].fields.readyNodeIds, [SEED_NODE_ID],
    'the ready node ids the evaluation saw: no joiner yet');
  t.same(lines[0].fields.ledgerVoterRows, ['r1', 'r2', 'r3'].map((suffix) =>
    `${LEDGER_PARTITION_ID}@${LEDGER_PARTITION_ID}-${suffix}@${SEED_NODE_ID}`),
  'every ledger voter row with its node');
  tables.nodes.push({node_id: JOINER_NODE_ID, connection_state: 'starting'});
  key = logOperationLedgerQuorumSpreadHoldNotEngaged(
    logger, message, cache, key);
  t.equal(lines.length, 1, 'a joiner that is not ready changes nothing');
  tables.services[2] = ledgerRow('r3', JOINER_NODE_ID);
  logOperationLedgerQuorumSpreadHoldNotEngaged(logger, message, cache, key);
  t.equal(lines.length, 2, 'changed evidence is logged again');
  t.end();
});
