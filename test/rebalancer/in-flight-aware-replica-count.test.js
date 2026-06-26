import {test} from '../../src/test-helpers/tap.js';
import {computeInFlightAwareReplicaAccounting} from '../../src/rebalancer/in-flight-aware-replica-count.js';
import {REBALANCER_MOVE_TYPE as MoveType} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const PARTITION = 'sql_write_operations-p1';

function row(replicaId, nodeId, status = ReplicaStatus.ACTIVE) {
  return {replica_id: replicaId, node_id: nodeId, status, partition_id: PARTITION};
}

function op(type, replicaId, targetNodeId, workflowStep = 'creating') {
  return {
    operation_id: `op-${replicaId}-${targetNodeId}`,
    type,
    partition_id: PARTITION,
    replica_id: replicaId,
    target_node_id: targetNodeId,
    workflow_step: workflowStep,
  };
}

test('in-flight-aware replica accounting (single-owner count)', async (t) => {
  await t.test('committed rows: active vs occupied are distinguished', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        row('r1', 'n1', ReplicaStatus.ACTIVE),
        row('r2', 'n2', ReplicaStatus.CREATING),
        row('r3', 'n3', ReplicaStatus.SYNCING),
      ],
      inFlightOperations: [],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 1, 'only ACTIVE rows are voters');
    t.equal(acc.occupiedCount, 3, 'pending/creating/syncing/active all occupy');
    t.equal(acc.deficitEffectiveCount, 1, 'no in-flight ops to add');
    t.equal(acc.creationEffectiveCount, 1);
    t.end();
  });

  await t.test('a replica row with no node_id is ignored', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), {replica_id: 'rX', node_id: null}],
      inFlightOperations: [],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 1);
    t.end();
  });

  await t.test('in-flight ADD increases deficit AND creation count', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2')],
      inFlightOperations: [op(MoveType.ADD, 'r3', 'n3')],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 2);
    t.equal(acc.inFlightAddCount, 1);
    t.equal(acc.inFlightReplaceInCreationCount, 0);
    t.equal(acc.deficitEffectiveCount, 3, 'ADD fills the deficit');
    t.equal(acc.creationEffectiveCount, 3);
    t.end();
  });

  await t.test('in-flight ADD whose row already exists is NOT double counted', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      // r3 already materialized as a CREATING row AND still has its in-flight op
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2'), row('r3', 'n3', ReplicaStatus.CREATING)],
      inFlightOperations: [op(MoveType.ADD, 'r3', 'n3')],
      partitionId: PARTITION,
    });
    t.equal(acc.occupiedCount, 3, 'r3 occupies once');
    t.equal(acc.inFlightAddCount, 0, 'op for an already-occupied replica is not re-counted');
    t.equal(acc.deficitEffectiveCount, 2, 'active(2) + add(0)');
    t.end();
  });

  await t.test('in-flight REPLACE is creation pressure (+1) but NOT deficit fill', (t) => {
    // target 3, 3 active, one REPLACE in creation (replacement coming, source still present)
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2'), row('r3', 'n3')],
      // replica_id is the SOURCE being replaced; replacement has no row yet
      inFlightOperations: [op(MoveType.REPLACE, 'r3', 'n4')],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 3);
    t.equal(acc.inFlightAddCount, 0, 'a REPLACE never fills a deficit');
    t.equal(acc.inFlightReplaceInCreationCount, 1);
    t.equal(acc.deficitEffectiveCount, 3, 'deficit view: still at target, no ADD');
    t.equal(acc.creationEffectiveCount, 4, 'creation view: transient +1 overshoot');
    t.end();
  });

  await t.test('TWO in-flight REPLACEs = the over-creation signature (+2)', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2'), row('r3', 'n3')],
      inFlightOperations: [
        op(MoveType.REPLACE, 'r3', 'n4'),
        op(MoveType.REPLACE, 'r3', 'n5'), // target-hopped to a second node
      ],
      partitionId: PARTITION,
    });
    t.equal(acc.creationEffectiveCount, 5, 'active 3 + 2 replacements = over target+1');
    t.end();
  });

  await t.test('terminal / removing ops are not add-transitional', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2'), row('r3', 'n3')],
      inFlightOperations: [
        op(MoveType.REPLACE, 'r3', 'n4', 'removing'),
        op(MoveType.ADD, 'r4', 'n4', 'removed'),
      ],
      partitionId: PARTITION,
    });
    t.equal(acc.inFlightAddCount, 0);
    t.equal(acc.inFlightReplaceInCreationCount, 0);
    t.equal(acc.creationEffectiveCount, 3);
    t.end();
  });

  await t.test('ops for a different partition are excluded', (t) => {
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1')],
      inFlightOperations: [
        {...op(MoveType.ADD, 'r2', 'n2'), partition_id: 'other-p1'},
      ],
      partitionId: PARTITION,
    });
    t.equal(acc.inFlightAddCount, 0, 'other-partition op ignored');
    t.end();
  });

  await t.test('dispatch-sending workflow step counts as add-transitional', (t) => {
    // The dispatch step is the raw enum value "SENDING" (uppercase), as the
    // planner's own classifier compares it.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [row('r1', 'n1'), row('r2', 'n2')],
      inFlightOperations: [op(MoveType.ADD, 'r3', 'n3', 'SENDING')],
      partitionId: PARTITION,
    });
    t.equal(acc.inFlightAddCount, 1);
    t.end();
  });
});
