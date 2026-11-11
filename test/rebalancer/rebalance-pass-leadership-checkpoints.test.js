/**
 * A rebalance pass re-reads its own leadership after every stretch of awaits
 * that precedes a decision or an effect taken as the leader.
 *
 * rebalance() checked leadership once at entry and then awaited the policy,
 * the target state and the failed-create cleanup refresh before the
 * synchronous plan, and four more reads before executing it. A rebalancer
 * deposed while suspended planned without a leader identity (cached rows
 * read every co-located replica as a follower, so row order chose the
 * removal source - possibly the new leader) and created operations.
 *
 * Receipts: leadership lost in any await before the plan -> typed NOT_LEADER
 * at the before_planning checkpoint, the plan is never calculated, nothing is
 * executed; lost between plan and execution -> NOT_LEADER at
 * before_execution, nothing executed; lost while executing -> the moves not
 * yet started are answered NOT_LEADER; control: leadership held -> the pass
 * plans and executes as before.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REBALANCER_LOG_MSG,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REBALANCE_LEADERSHIP_CHECKPOINT,
} from '../../src/rebalancer/unified-rebalancer-rebalance-loop.js';
import {createTestRebalancer} from './test-helpers.js';

const PARTITION_ID = 'orders-p7';
const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const NOT_LEADER = 'not_leader';

function openPass() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const replicaId = `${PARTITION_ID}-r1`;
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    nodeId: NODE_IDS[0],
    cacheData: {
      nodes: NODE_IDS.map((nodeId) => ({node_id: nodeId, status: 'active',
        connection_state: 'ready'})),
      services: [{service_id: replicaId, replica_id: replicaId,
        partition_id: PARTITION_ID, node_id: NODE_IDS[0],
        service_type: 'partition', status: ReplicaStatus.ACTIVE,
        raft_role: 'follower'}],
      partitions: [{partition_id: PARTITION_ID, table_id: 'orders',
        leader_node_id: NODE_IDS[0], replica_count: 3}],
      replicaOperations: [],
    },
  });
  rebalancer.replicaId = replicaId;
  rebalancer.initialize();
  rebalancer.setLeader(true);
  const pass = {rebalancer, planned: 0, executed: [], lostLogs: []};
  const planner = rebalancer.movePlanner;
  const calculateMoves = planner.calculateMoves.bind(planner);
  planner.calculateMoves = (...args) => {
    pass.planned += 1;
    return calculateMoves(...args);
  };
  rebalancer.executeMove = async (move) => {
    pass.executed.push(move);
    await pass.duringExecute?.(move);
    return {success: true, operation: move.type, nodeId: move.nodeId};
  };
  const info = rebalancer.logger.info.bind(rebalancer.logger);
  rebalancer.logger.info = (message, fields) => {
    if (message === REBALANCER_LOG_MSG.LEADERSHIP_LOST_DURING_REBALANCE) {
      pass.lostLogs.push(fields);
    }
    return info(message, fields);
  };
  pass.close = () => {
    rebalancer.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  };
  return pass;
}

// Lose leadership while the named await is suspended: after it resolved,
// before the pass resumes.
function loseLeadershipDuring(owner, methodName, rebalancer) {
  const original = owner[methodName].bind(owner);
  owner[methodName] = async (...args) => {
    const value = await original(...args);
    rebalancer.setLeader(false);
    return value;
  };
}

test('control: a pass that holds leadership plans and executes', async (t) => {
  const pass = openPass();
  try {
    const result = await pass.rebalancer.rebalance();
    t.equal(result.success, true, 'the pass succeeded');
    t.equal(pass.planned, 1, 'the plan was calculated once');
    t.ok(pass.executed.length >= 1,
      `moves were executed (${pass.executed.length})`);
    t.equal(pass.lostLogs.length, 0, 'no leadership loss was reported');
  } finally {
    pass.close();
  }
});

const AWAITS_BEFORE_PLANNING = Object.freeze([
  ['the policy read', (rebalancer) => [rebalancer, 'getPolicy']],
  ['the target-state calculation',
    (rebalancer) => [rebalancer.movePlanner, 'calculateTargetState']],
  ['the failed-create cleanup refresh',
    (rebalancer) => [rebalancer, 'refreshFailedCreateTargetCleanupDecisions']],
]);

for (const [label, awaited] of AWAITS_BEFORE_PLANNING) {
  test(`leadership lost during ${label}: typed NOT_LEADER, no plan, ` +
    'nothing created', async (t) => {
    const pass = openPass();
    try {
      const [owner, methodName] = awaited(pass.rebalancer);
      loseLeadershipDuring(owner, methodName, pass.rebalancer);
      const result = await pass.rebalancer.rebalance();
      t.equal(result.success, false, 'the pass did not succeed');
      t.equal(result.reason, NOT_LEADER, 'the outcome is typed NOT_LEADER');
      t.equal(result.leadershipCheckpoint,
        REBALANCE_LEADERSHIP_CHECKPOINT.BEFORE_PLANNING,
        'it names the checkpoint that saw the loss');
      t.same(result.moves, [], 'it carries no moves');
      t.equal(pass.planned, 0, 'calculateMoves was never called');
      t.equal(pass.executed.length, 0, 'nothing was executed');
      t.equal(pass.lostLogs.length, 1, 'the loss is logged once');
      t.equal(pass.lostLogs[0].entityId, PARTITION_ID,
        'the log names the partition');
    } finally {
      pass.close();
    }
  });
}

test('leadership lost between the plan and its execution: typed ' +
  'NOT_LEADER, nothing created', async (t) => {
  const pass = openPass();
  try {
    loseLeadershipDuring(pass.rebalancer.movePlanner, 'applyPressureGating',
      pass.rebalancer);
    const result = await pass.rebalancer.rebalance();
    t.equal(pass.planned, 1, 'setup: the plan was calculated as leader');
    t.equal(result.reason, NOT_LEADER, 'the outcome is typed NOT_LEADER');
    t.equal(result.leadershipCheckpoint,
      REBALANCE_LEADERSHIP_CHECKPOINT.BEFORE_EXECUTION,
      'at the checkpoint before execution');
    t.equal(pass.executed.length, 0, 'nothing was executed');
    t.equal(pass.lostLogs.length, 1, 'the loss is logged once');
  } finally {
    pass.close();
  }
});

test('leadership lost while executing: the moves not yet started are ' +
  'answered NOT_LEADER', async (t) => {
  const pass = openPass();
  try {
    pass.rebalancer.moveBatchSize = 1;
    pass.duringExecute = async () => {
      pass.rebalancer.setLeader(false);
    };
    const planned = [NODE_IDS[1], NODE_IDS[2]].map((nodeId) =>
      ({type: 'add', nodeId, reason: 'test'}));
    pass.rebalancer.isNodeReady = async () => true;
    const results = await pass.rebalancer.executeRebalancingMoves(planned);
    t.equal(pass.executed.length, 1,
      'the move started as leader is the only one executed');
    const refused = results.filter((result) => result.reason === NOT_LEADER);
    t.equal(refused.length, planned.length - 1,
      'every later move is answered NOT_LEADER');
    t.ok(refused.every((result) => result.skipped === true &&
      result.success === false), 'as skipped, not as failed work');
    t.ok(pass.lostLogs.length >= 1, 'the loss is logged');
  } finally {
    pass.close();
  }
});
