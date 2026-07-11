import {test} from '../../src/test-helpers/tap.js';
import {
  REPLICA_INVENTORY_EFFECTIVE_VIEW,
  buildReplicaInventorySnapshot,
  countsTowardVoterTarget,
  effectiveReplicaCountAfterOperations,
  occupiesNode,
} from '../../src/rebalancer/replica-inventory.js';

const PARTITION_ID = 'sql_write_operations-p1';

function service(replicaId, nodeId, options = {}) {
  return {
    replica_id: replicaId,
    service_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status: options.status || 'active',
    raft_role: options.raftRole || '',
  };
}

function productionReplace(options = {}) {
  return {
    operation_id: options.operationId || 'replace-r1-with-r4',
    type: 'REPLACE',
    entity_type: 'partition',
    entity_id: PARTITION_ID,
    partition_id: PARTITION_ID,
    // Production persists the TARGET identity here, not the source identity.
    replica_id: options.targetReplicaId || 'r4',
    source_node_id: options.sourceNodeId || 'n1',
    target_node_id: options.targetNodeId || 'n4',
    status: options.status || 'creating',
    workflow_step: options.workflowStep || 'CREATING',
    steps_history: JSON.stringify([{
      step: 'PENDING',
      sourceReplicaId: options.sourceReplicaId || 'r1',
    }]),
  };
}

function build(options = {}) {
  return buildReplicaInventorySnapshot({
    entityType: 'partition',
    entityId: PARTITION_ID,
    capturedAtMs: 1_000,
    committedRowsObservation: {
      state: 'present',
      rows: options.rows || [],
      revision: options.rowRevision ?? 90,
      observedAtMs: options.rowObservedAtMs ?? 980,
    },
    inFlightOperationObservation: {
      state: options.operationState || 'present',
      operations: options.operations || [],
      revision: options.operationRevision ?? 91,
      observedAtMs: options.operationObservedAtMs ?? 990,
    },
    replicationStateByReplicaId: options.replicationStateByReplicaId,
  });
}

test('canonical replica inventory', async (t) => {
  await t.test(
    'normalizes production REPLACE target/source shape without false drain credit',
    (t) => {
      const snapshot = build({
        rows: [
          service('r1', 'n1', {raftRole: 'follower'}),
          service('r2', 'n2', {raftRole: 'follower'}),
          service('r3', 'n3', {raftRole: 'follower'}),
          service('r4', 'n4', {status: 'creating'}),
        ],
        operations: [productionReplace()],
      });

      t.equal(snapshot.operations[0].sourceReplicaId, 'r1');
      t.equal(snapshot.operations[0].targetReplicaId, 'r4');
      t.equal(snapshot.accounting.drainPhaseReplacementCredit, 0,
        'active source means the materialized target receives no drain credit');
      t.equal(
        effectiveReplicaCountAfterOperations(
          snapshot,
          REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL,
        ),
        3,
      );
      t.equal(
        effectiveReplicaCountAfterOperations(
          snapshot,
          REPLICA_INVENTORY_EFFECTIVE_VIEW.PEAK_CREATION,
        ),
        4,
      );
      t.equal(
        effectiveReplicaCountAfterOperations(
          snapshot,
          REPLICA_INVENTORY_EFFECTIVE_VIEW.SETTLED_VOTER_TARGET,
        ),
        3,
        'settled REPLACE removes the source influence as it adds the target',
      );
      t.end();
    },
  );

  await t.test('credits exactly one materialized target after source drain', (t) => {
    const snapshot = build({
      rows: [
        service('r2', 'n2', {raftRole: 'follower'}),
        service('r3', 'n3', {raftRole: 'follower'}),
        service('r4', 'n4', {status: 'syncing'}),
      ],
      operations: [productionReplace()],
    });
    t.equal(snapshot.accounting.drainPhaseReplacementCredit, 1);
    t.equal(
      effectiveReplicaCountAfterOperations(
        snapshot,
        REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL,
      ),
      3,
    );
    t.end();
  });

  await t.test('active materialized REPLACE target is not counted twice', (t) => {
    const snapshot = build({
      rows: [
        service('r1', 'n1', {raftRole: 'follower'}),
        service('r2', 'n2', {raftRole: 'follower'}),
        service('r3', 'n3', {raftRole: 'follower'}),
        service('r4', 'n4', {raftRole: 'follower'}),
      ],
      operations: [productionReplace()],
    });
    t.equal(snapshot.accounting.activeCount, 4);
    t.equal(snapshot.accounting.inFlightReplaceInCreationCount, 0);
    t.equal(snapshot.accounting.creationEffectiveCount, 4,
      'the active target row subsumes stale creation influence');
    t.end();
  });

  await t.test('ambiguous REPLACE source metadata fails canonical use closed', (t) => {
    const operation = productionReplace();
    delete operation.steps_history;
    const snapshot = build({
      rows: [
        service('r1', 'n1', {raftRole: 'follower'}),
        service('r4', 'n4', {status: 'creating'}),
      ],
      operations: [operation],
    });
    t.match(snapshot.anomalies, [{
      code: 'replace_source_identity_unavailable',
    }]);
    t.equal(snapshot.provenance.topologyIncreaseUsable, false,
      'replica_id is never silently reinterpreted as the source');
    t.end();
  });

  await t.test('orphan occupancy and voter-target contribution stay distinct', (t) => {
    const snapshot = build({
      rows: [
        service('voter', 'n1', {raftRole: 'follower'}),
        service('learner', 'n2', {status: 'syncing', raftRole: 'learner'}),
        service('orphan', 'n3', {raftRole: 'learner'}),
      ],
    });
    t.equal(occupiesNode(snapshot, 'n1'), true);
    t.equal(occupiesNode(snapshot, 'n2'), true);
    t.equal(occupiesNode(snapshot, 'n3'), true,
      'an orphan remains physical occupancy');
    t.equal(countsTowardVoterTarget(snapshot, 'voter'), true);
    t.equal(countsTowardVoterTarget(snapshot, 'learner'), true,
      'a catching-up learner still reserves its target slot');
    t.equal(countsTowardVoterTarget(snapshot, 'orphan'), false,
      'an active non-voter without owner evidence is an orphan');
    t.same(snapshot.orphanReplicaIds, ['orphan']);
    t.end();
  });

  await t.test('in-flight target occupies once after its row materializes', (t) => {
    const add = {
      operation_id: 'add-r2',
      type: 'ADD',
      entity_type: 'partition',
      entity_id: PARTITION_ID,
      partition_id: PARTITION_ID,
      replica_id: 'r2',
      target_node_id: 'n2',
      status: 'creating',
      workflow_step: 'CREATING',
    };
    const absent = build({
      rows: [service('r1', 'n1', {raftRole: 'follower'})],
      operations: [add],
    });
    const materialized = build({
      rows: [
        service('r1', 'n1', {raftRole: 'follower'}),
        service('r2', 'n2', {status: 'creating'}),
      ],
      operations: [add],
    });
    t.equal(occupiesNode(absent, 'n2'), true);
    t.equal(absent.accounting.inFlightAddCount, 1);
    t.equal(materialized.accounting.inFlightAddCount, 0);
    t.equal(materialized.occupiedNodeIds.filter((id) => id === 'n2').length, 1);
    t.end();
  });

  await t.test('provenance is honest about skew, atomicity, and deferral', (t) => {
    const snapshot = build({
      rows: [service('r1', 'n1', {raftRole: 'follower'})],
      operationState: 'deferred',
      rowRevision: 10,
      operationRevision: 14,
      rowObservedAtMs: 900,
      operationObservedAtMs: 990,
    });
    t.equal(snapshot.provenance.atomicityClaim, 'not_claimed');
    t.equal(snapshot.provenance.observedAtSkewMs, 90);
    t.equal(snapshot.provenance.topologyIncreaseUsable, false,
      'deferred operation visibility is not equivalent to empty');
    t.same(snapshot.sourceRevisions, {
      committedRows: 10,
      inFlightOperations: 14,
    });
    t.end();
  });

  await t.test('conflicting duplicate identities fail topology increase closed', (t) => {
    const snapshot = build({
      rows: [
        service('r1', 'n1', {raftRole: 'follower'}),
        service('r1', 'n2', {raftRole: 'follower'}),
      ],
    });
    t.match(snapshot.anomalies, [{code: 'duplicate_replica_identity_conflict'}]);
    t.equal(occupiesNode(snapshot, 'n1'), true);
    t.equal(occupiesNode(snapshot, 'n2'), true,
      'conflicting observations conservatively occupy their union');
    t.equal(snapshot.provenance.topologyIncreaseUsable, false);
    t.end();
  });

  await t.test('conflicting duplicate operation ids union target influence once',
    (t) => {
      const base = {
        operation_id: 'same-operation',
        type: 'ADD',
        entity_type: 'partition',
        entity_id: PARTITION_ID,
        partition_id: PARTITION_ID,
        replica_id: 'r2',
        status: 'creating',
        workflow_step: 'CREATING',
      };
      const snapshot = build({
        operations: [
          {...base, target_node_id: 'n2'},
          {...base, target_node_id: 'n3'},
        ],
      });
      t.match(snapshot.anomalies, [{
        code: 'duplicate_operation_identity_conflict',
      }]);
      t.equal(occupiesNode(snapshot, 'n2'), true);
      t.equal(occupiesNode(snapshot, 'n3'), true);
      t.equal(snapshot.accounting.inFlightAddCount, 1,
        'one logical operation contributes to effective count once');
      t.equal(snapshot.provenance.topologyIncreaseUsable, false);
      t.end();
    },
  );

  await t.test('source/target node overlap does not duplicate physical occupancy',
    (t) => {
      const snapshot = build({
        rows: [service('r1', 'n1', {raftRole: 'follower'})],
        operations: [productionReplace({targetNodeId: 'n1'})],
      });
      t.same(snapshot.occupiedNodeIds, ['n1']);
      t.equal(snapshot.accounting.creationEffectiveCount, 2,
        'peak creation remains distinct from physical node cardinality');
      t.end();
    },
  );

  await t.test('Raft-owned promotability is composed and never inferred', (t) => {
    const rows = [service('learner', 'n2', {
      status: 'syncing',
      raftRole: 'learner',
    })];
    const unavailable = build({rows});
    const supplied = build({
      rows,
      replicationStateByReplicaId: {
        learner: {promotable: true, matchIndex: 42},
      },
    });
    t.equal(unavailable.replicationClassificationState, 'unavailable');
    t.same(unavailable.promotableLearnerReplicaIds, []);
    t.equal(supplied.replicationClassificationState, 'available');
    t.same(supplied.promotableLearnerReplicaIds, ['learner']);
    t.end();
  });

  await t.test('source revision changes during capture fail increase closed', (t) => {
    const snapshot = buildReplicaInventorySnapshot({
      entityType: 'partition',
      entityId: PARTITION_ID,
      capturedAtMs: 1_000,
      committedRowsObservation: {
        state: 'present',
        rows: [service('r1', 'n1', {raftRole: 'follower'})],
        revisionBefore: 10,
        revisionAfter: 11,
        observedAtMs: 990,
      },
      inFlightOperationObservation: {
        state: 'empty',
        operations: [],
        revisionBefore: 20,
        revisionAfter: 20,
        observedAtMs: 995,
      },
    });
    t.equal(snapshot.provenance.consistency, 'source_changed_during_capture');
    t.equal(snapshot.provenance.topologyIncreaseUsable, false);
    t.end();
  });

  await t.test('input ordering cannot change inventory decisions', (t) => {
    const rows = [
      service('r1', 'n1', {raftRole: 'follower'}),
      service('r2', 'n2', {status: 'syncing'}),
    ];
    const operations = [
      productionReplace({operationId: 'replace-a'}),
      {
        operation_id: 'add-b',
        type: 'ADD',
        entity_type: 'partition',
        entity_id: PARTITION_ID,
        replica_id: 'r5',
        target_node_id: 'n5',
        status: 'creating',
      },
    ];
    const forward = build({rows, operations});
    const reversed = build({
      rows: [...rows].reverse(),
      operations: [...operations].reverse(),
    });
    t.same(forward.occupiedNodeIds, reversed.occupiedNodeIds);
    t.same(forward.voterTargetReplicaIds, reversed.voterTargetReplicaIds);
    t.same(forward.accounting, reversed.accounting);
    t.end();
  });

  await t.test('snapshot and nested DTOs are deeply immutable', (t) => {
    const rows = [service('r1', 'n1', {raftRole: 'follower'})];
    const snapshot = build({rows});
    rows[0].node_id = 'mutated-input';
    t.equal(snapshot.replicas[0].nodeId, 'n1', 'input rows were cloned');
    t.equal(Object.isFrozen(snapshot), true);
    t.equal(Object.isFrozen(snapshot.replicas), true);
    t.equal(Object.isFrozen(snapshot.replicas[0]), true);
    t.throws(() => snapshot.occupiedNodeIds.push('n9'));
    t.throws(() => effectiveReplicaCountAfterOperations(
      {},
      REPLICA_INVENTORY_EFFECTIVE_VIEW.DEFICIT_FILL,
    ), 'missing accounting cannot silently become a safe zero');
    t.end();
  });
});
