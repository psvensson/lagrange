// Mirror-effect retention lifecycle tests (quest
// raft-rs-single-path-partition-cutover, mirror retention), split by subject
// from committed-statement-outcome.test.js; shared fixtures in
// committed-statement-outcome-fixture.js.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {admitCommittedCommand, PARTITION_COMMITTED_COMMAND_ORIGIN} from
  '../../src/partition/partition-committed-command-admission.js';
import {sourceMirrorReservationFixture} from './source-mirror-reservation-fixture.js';
import {replicateSourceMirrorRetentionCustody} from '../../src/partition/partition-mirror-effect-retention.js';
import {decodeMirrorCustodyRow} from '../../src/partition/partition-mirror-custody-codec.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {
  GROUP_BUDGET_MS,
  TEMP_PREFIX,
  TEST_TIMEOUT_MS,
  partitionOptions,
  quietEnvironment,
  resetEnvironment,
  withPartition,
} from './committed-statement-outcome-fixture.js';
import {
  openGroupWriteAdmission,
  settleGroupLeader,
  transferGroupLeadership,
} from './partition-group-raft-controls.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {MIRROR_CUSTODY_FORMAT} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW,
  readCommittedStatementOutcome,
  readDurableMirrorRetentionCustodyIn,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  createPartitionSnapshotCadence,
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
} from '../../src/partition/partition-snapshot-cadence.js';
import {
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {readCheckpoint} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  requestSnapshotInstall, resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME} from '../../src/raft/snapshot-install-constants.js';
import {reconcileFailedMirrorCustody} from '../../src/partition/partition-mirror-custody-lifecycle.js';
import {loadDurableDeltasBehindWatermark} from '../../src/partition/partition-mirror-replay-cursor.js';
import {replaySplitEntry} from '../../src/partition/partition-split-routing.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
  resumeFixtureParticipantGroupAdmission,
} from '../test-helpers/participant-transaction-fixture.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

// One field of the durable custody a partition holds (undefined with none).
function assertDurableCustodyField(db, field, expected, message) {
  assert.equal(readDurableMirrorRetentionCustodyIn(db)?.[field], expected, message);
}

test('durable split effects: committed writes retain canonical affectedRows and ' +
  'changes across restart for trim(?), zero-row no-ops, and multi-child mutations',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const tableName = 'durable_split_rows';
  await withPartition('split-durable-effects', async ({open}) => {
    const partition = await open();
    const seed = async (key, value, entryId) => partition.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: `INSERT INTO ${tableName} (group_id, representative_node_id) VALUES (?, ?)`,
      params: [key, value], entryId,
    });
    assert.equal((await seed('\tA\t', 'node-left', 'entry-seed-left')).success, true);
    const seedZ = await seed('Z', 'node-right', 'entry-seed-right');
    assert.equal(seedZ.success, true);
    const watermarkIndex = seedZ.logIndex;

    const deleteTrim = await partition.applyWrite({
      type: PARTITION_SERVICE_OPERATION.DELETE,
      sql: `DELETE FROM ${tableName} WHERE group_id = trim(?)`,
      params: ['\tA\t'],
      entryId: 'entry-delete-trim',
    });
    assert.equal(deleteTrim.success, true);
    assert.equal(deleteTrim.changes, 1);

    const noOpDeleteTrim = await partition.applyWrite({
      type: PARTITION_SERVICE_OPERATION.DELETE,
      sql: `DELETE FROM ${tableName} WHERE group_id = trim(?)`,
      params: ['\tA\t'],
      entryId: 'entry-noop-trim',
    });
    assert.equal(noOpDeleteTrim.success, true);
    assert.equal(noOpDeleteTrim.changes, 0);

    const multiChildInsert = await partition.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql:
        `INSERT INTO ${tableName} (group_id, representative_node_id) ` +
        'VALUES (?, ?), (?, ?)',
      params: ['B', 'node-b', 'Y', 'node-y'],
      entryId: 'entry-multi-child-insert',
    });
    assert.equal(multiChildInsert.success, true);
    assert.equal(multiChildInsert.changes, 2);

    await partition.shutdown();

    const recovered = await open();
    const deleteOutcome = readCommittedStatementOutcome(
      recovered,
      recovered.getCommittedEntryKey({entryId: 'entry-delete-trim'}),
    );
    assert.equal(deleteOutcome.changes, 1);
    assert.equal(deleteOutcome.mutationKind, PARTITION_SERVICE_OPERATION.DELETE);
    assert.equal(deleteOutcome.affectedRows?.length, 1);
    assert.equal(deleteOutcome.affectedRows[0].group_id, '\tA\t');

    const noOpOutcome = readCommittedStatementOutcome(
      recovered,
      recovered.getCommittedEntryKey({entryId: 'entry-noop-trim'}),
    );
    assert.equal(noOpOutcome.changes, 0);
    assert.deepEqual(noOpOutcome.affectedRows, []);

    const deltas = loadDurableDeltasBehindWatermark(recovered, watermarkIndex);
    assert.equal(deltas.length, 3);
    assert.equal(deltas[0].entryId, 'entry-delete-trim');
    assert.equal(deltas[0].changes, 1);
    assert.equal(deltas[0].mutationKind, PARTITION_SERVICE_OPERATION.DELETE);
    assert.equal(deltas[0].affectedRows?.[0]?.group_id, '\tA\t');
    assert.equal(deltas[1].entryId, 'entry-noop-trim');
    assert.equal(deltas[1].changes, 0);
    assert.deepEqual(deltas[1].affectedRows, []);
    assert.equal(deltas[2].entryId, 'entry-multi-child-insert');
    assert.equal(deltas[2].changes, 2);
    assert.equal(deltas[2].mutationKind, PARTITION_SERVICE_OPERATION.INSERT);
    assert.equal(deltas[2].affectedRows?.length, 2);

    const mirrored = [];
    const metadata = {
      primaryKeyColumn: 'group_id',
      splitKey: 'M',
      targetPartitionIds: ['rep-left', 'rep-right'],
    };
    const queryExecutor = {
      async executeOnPartition(partitionId, sql, params, _r, _w, _tx, options) {
        mirrored.push({partitionId, sql, params, entryId: options?.entryId});
        return {success: true};
      },
    };
    for (const delta of deltas) {
      await replaySplitEntry(delta, metadata, {
        tableName,
        queryExecutor,
      });
    }
    assert.deepEqual(
      mirrored.map((item) => ({
        partitionId: item.partitionId,
        entryId: item.entryId,
      })),
      [
        {partitionId: 'rep-left', entryId: 'entry-delete-trim'},
        {partitionId: 'rep-left', entryId: 'entry-multi-child-insert'},
        {partitionId: 'rep-right', entryId: 'entry-multi-child-insert'},
      ],
      'post-restart recovery mirrors trim(?), skips the zero-row no-op, and ' +
      'projects the multi-child mutation to both children',
    );
  }, {tableName, tableId: tableName});
});

test('durable custody refuses scalar, unversioned and incomplete identities', () => {
  const custody = {format: MIRROR_CUSTODY_FORMAT, barrierIndex: 8, family: 'split',
    workflowId: 'split-1', workflowAttempt: 1, workflowFenceToken: 3, targetPartitionVersion: 2};
  const decode = (value) => decodeMirrorCustodyRow({entry_key: '__mirror_retention_barrier__',
    log_index: 0, mutation_kind: 'PINNED', typed_effects_json: JSON.stringify(value)});
  assert.deepEqual(decode(custody), custody);
  const origin = PARTITION_COMMITTED_COMMAND_ORIGIN.MIRROR_RETENTION_OWNER;
  for (const action of ['PIN', 'RELEASE']) {
    const command = {type: PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY,
      action, entryId: 'custody-test', partitionId: 'orders-p1', custody,
      timestamp: '1', proposedBy: 'orders-p1-r1', proposedAt: 1};
    assert.equal(admitCommittedCommand(command, {origin}).admitted, true);
    for (const [field, value] of Object.entries({mirrorRetentionBarrierIndex: 8,
      mirrorRetentionRelease: true, mirrorRetentionCustody: custody})) {
      const refusal = admitCommittedCommand({...command, [field]: value}, {origin});
      assert.equal(refusal.admitted, false);
      assert.equal(refusal.code, 'mirror_retention_custody_bytes_invalid');
    }
  }
  for (const invalid of [8, {...custody, format: undefined}, {...custody, barrierIndex: '8'},
    {...custody, workflowFenceToken: null}, {...custody, workflowAttempt: -1}]) {
    assert.throws(() => decode(invalid), {code: 'mirror_retention_custody_bytes_invalid'});
  }
});

test('a custody command with a field outside its pinned form is malformed: refused at ' +
  'admission and never applied', {timeout: TEST_TIMEOUT_MS}, async () => {
  const partitionId = 'custody-unknown-field';
  const custody = {format: MIRROR_CUSTODY_FORMAT, barrierIndex: 0, family: 'split',
    workflowId: 'split-orders', workflowAttempt: 1, workflowFenceToken: 1, targetPartitionVersion: 2};
  const pinned = {type: PARTITION_SERVICE_OPERATION.MIRROR_RETENTION_CUSTODY, action: 'PIN',
    entryId: 'custody-pin', partitionId, custody, timestamp: '1', proposedBy: 'other-replica',
    proposedAt: 1};
  const origin = PARTITION_COMMITTED_COMMAND_ORIGIN.MIRROR_RETENTION_OWNER;
  // Any field outside the pinned form, the three retired custody field names
  // included, is an ordinary unknown field.
  const unknownFields = ['unknownField', 'mirrorRetentionBarrierIndex', 'mirrorRetentionRelease',
    'mirrorRetentionCustody'];
  assert.equal(admitCommittedCommand(pinned, {origin}).admitted, true, 'the pinned form');
  for (const field of unknownFields) {
    const refusal = admitCommittedCommand({...pinned, [field]: 1}, {origin});
    assert.equal(refusal.admitted, false, `${field} is refused before consensus`);
    assert.equal(refusal.code, 'mirror_retention_custody_bytes_invalid', field);
  }
  // Proposed straight through the port, past admission: the application
  // leaves every malformed form unapplied and applies the pinned one.
  await withPartition(partitionId, async ({open}) => {
    const service = await open();
    for (const field of unknownFields) {
      await turnChainValue(service.raft.propose(
        {...pinned, entryId: `custody-${field}`, [field]: 1}));
      assert.equal(readDurableMirrorRetentionCustodyIn(service.db), null,
        `the command carrying ${field} holds no custody`);
    }
    await turnChainValue(service.raft.propose(pinned));
    assert.notEqual(readDurableMirrorRetentionCustodyIn(service.db), null,
      'the pinned command acquires custody');
  });
});

test(
  'L9-RETENTION-2: complete source retention lifecycle on the same partition covers ' +
    'refused start, pre-cutover abort release, no-DML acquisition across held catch-up ' +
    'and leadership transfer, snapshot custody preservation and compacted boundary ' +
    'reporting, and post-completion steady-state retirement',
  {timeout: TEST_TIMEOUT_MS * 3},
  async () => {
    quietEnvironment();
    const partitionId = 'outcome-follower-stale-cache';
    const userTableName = 'user_orders';
    const userTableSchema = Object.freeze({
      columns: [
        {name: 'group_id', type: 'TEXT', primaryKey: true},
        {name: 'representative_node_id', type: 'TEXT'},
      ],
    });
    const members = [
      [`${partitionId}-r1`, 'node-1'],
      [`${partitionId}-r2`, 'node-2'],
      [`${partitionId}-r3`, 'node-3'],
    ];
    const group = await formAdmittedGroup({
      partitionId, members, tempPrefix: TEMP_PREFIX, budgetMs: GROUP_BUDGET_MS,
      serviceOptions: {
        ...partitionOptions(partitionId, null),
        tableId: userTableName, tableName: userTableName, schema: userTableSchema,
      },
    });
    await openGroupWriteAdmission(group, group.services[0]);
    const childDir = fs.mkdtempSync(path.join(os.tmpdir(), `${TEMP_PREFIX}children-`));
    const childServices = [];
    const openChildPartition = async (childPartitionId) => {
      const child = new PartitionService(withFoundingStamp({
        ...partitionOptions(childPartitionId, path.join(childDir, `${childPartitionId}.sqlite`)),
        tableId: userTableName, tableName: userTableName, schema: userTableSchema,
      }));
      childServices.push(child);
      await child.initialize();
      await resumeFixtureParticipantAdmission(child);
      return child;
    };

    try {
      const [initialLeader, follower] = group.services;
      let thirdReplica = group.services[2];
      const membershipGenerationEpoch = Number(
        RaftRsDurableStore.readDurableRecordIn(initialLeader.db, partitionId)
          .membershipGenerationIndex,
      );
      for (const svc of group.services) {
        svc.systemTableCache.applySystemTableChange('control_plane_publications', 'INSERT', {
          publication_id: `pub-${partitionId}`, status: 'PUBLISHED',
          publication_epoch: membershipGenerationEpoch,
        });
        svc.systemTableCache.applySystemTableChange('tables', 'INSERT', {
          table_id: userTableName, table_name: userTableName, active_partition_version: 1,
          pending_partition_version: null, partition_transition_state: 'active',
          partition_transition_metadata: null,
        });
        svc.systemTableCache.applySystemTableChange('partitions', 'INSERT', {
          partition_id: partitionId, table_name: userTableName, replica_count: 3,
        });
      }

      let releaseRefusedAuth;
      const refusedAuthGate = new Promise((resolve) => {
        releaseRefusedAuth = resolve;
      });
      initialLeader.sqlQueryEngine = {
        managedSplitWorkflow: {
          async reserveSourceMirrorCustody() {
            await refusedAuthGate;
            return false;
          },
        },
      };
      const refusedMeta = {
        workflowId: 'wf-split-refused-start', workflowAttempt: 1, workflowFenceToken: 1,
        primaryKeyColumn: 'group_id', sourcePartitionId: partitionId, splitKey: 'M',
        targetPartitionIds: ['orders-left', 'orders-right'], targetPartitionVersion: 2,
      };
      const refusedStartPromise = initialLeader.handleStartSplitReplication({
        partitionId, tableId: userTableName, tableName: userTableName,
        transitionMetadata: refusedMeta,
      });
      const seedWrite = await initialLeader.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: `INSERT INTO ${userTableName} (group_id, representative_node_id) VALUES (?, ?)`,
        params: ['A-seed', 'node-0'], entryId: 'entry-follower-stale-seed',
      });
      assert.equal(seedWrite.success, true);
      releaseRefusedAuth();
      assert.equal((await refusedStartPromise).success, false);
      assert.equal(readDurableMirrorRetentionCustodyIn(initialLeader.db), null);

      const abortedMeta = {
        ...refusedMeta, workflowId: 'wf-split-aborted-pre-cutover', workflowAttempt: 2, workflowFenceToken: 2,
      };
      initialLeader.sqlQueryEngine = {
        queryExecutor: {
          async executeOnPartition() {
            return {success: true};
          },
        },
        managedSplitWorkflow: {
          reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
          async acknowledgeSourceParticipant(_wfId, ack) {
            if (ack.status === 'snapshot_started') return {result: 'accepted'};
            throw new Error('simulated backfill/catchup pre-cutover failure');
          },
        },
      };
      const occupied = [];
      const queue = initialLeader.proposalQueue;
      while (queue.size < queue.capacityFor('ordinary')) {
        const id = `retention-pressure-${occupied.length}`;
        queue.enqueue(id, {resolve() {}, reject() {}});
        occupied.push(id);
      }
      try {
        await assert.rejects(initialLeader.handleStartSplitReplication({
          partitionId, tableId: userTableName, tableName: userTableName,
          transitionMetadata: abortedMeta,
        }), /custody commitment unconfirmed/u);
        assert.equal(initialLeader.splitReplication, null);
        assert.ok(group.services.every((svc) =>
          readDurableMirrorRetentionCustodyIn(svc.db) === null));
      } finally {
        for (const id of occupied) queue.resolve(id, {});
      }
      assert.equal((await initialLeader.handleStartSplitReplication({
        partitionId, tableId: userTableName, tableName: userTableName,
        transitionMetadata: abortedMeta,
      })).success, true);
      await initialLeader.splitReplicationRun;
      initialLeader.systemTableCache.applySystemTableChange('tables', 'UPDATE', {
        table_id: userTableName, table_name: userTableName, active_partition_version: 1,
        pending_partition_version: null, partition_transition_state: 'failed',
        partition_transition_metadata: JSON.stringify(abortedMeta),
      });
      for (let i = 1; i <= STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW + 40; i += 1) {
        const w = await initialLeader.applyWrite({
          type: PARTITION_SERVICE_OPERATION.UPDATE,
          sql: `UPDATE ${userTableName} SET representative_node_id = ? WHERE group_id = ?`,
          params: [`node-abort-${i}`, 'A-seed'], entryId: `entry-after-abort-${i}`,
        });
        assert.equal(w.success, true);
      }
      assertDurableCustodyField(initialLeader.db, 'workflowId',
        abortedMeta.workflowId, 'an uncertain acknowledgement retains protection');
      const countPositiveEffectsSql =
        'SELECT COUNT(*) AS count FROM _partition_statement_outcome_effects WHERE log_index > 0';
      assert.ok(initialLeader.db.prepare(countPositiveEffectsSql).get().count >
        STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW);
      let terminalMetadata = {...abortedMeta, mirrorExecutionEnded: true, mirrorCustodyGrants: [
        {partitionId, fence: abortedMeta.workflowFenceToken + 1},
      ]};
      const terminalRow = () => ({table_id: userTableName, partition_transition_state: 'failed',
        pending_partition_version: null, partition_transition_generation: 7,
        partition_transition_metadata: JSON.stringify(terminalMetadata)});
      const releaseOwner = initialLeader.sqlQueryEngine.managedSplitWorkflow;
      releaseOwner.readAuthoritativeWorkflowRecord = async () => terminalRow();
      await reconcileFailedMirrorCustody(initialLeader);
      assertDurableCustodyField(initialLeader.db, 'workflowFenceToken',
        abortedMeta.workflowFenceToken);
      terminalMetadata.mirrorCustodyGrants = [{partitionId, fence: abortedMeta.workflowFenceToken}];
      let allowAck = false;
      releaseOwner.getControlPlaneSystemTableGateway = () => ({
        async updateSystemTableRow(_table, where, data) {
          if (!allowAck ||
              where.partition_transition_metadata !== terminalRow().partition_transition_metadata) {
            return {affectedRows: 0};
          }
          terminalMetadata = JSON.parse(data.partition_transition_metadata);
          return {affectedRows: 1};
        },
      });
      await assert.rejects(reconcileFailedMirrorCustody(initialLeader),
        {code: 'MIRROR_RELEASE_ACK_UNCONFIRMED'});
      assert.equal(readDurableMirrorRetentionCustodyIn(initialLeader.db), null);
      assert.equal(terminalMetadata.mirrorCustodyGrants.length, 1);
      // The release committed before its control-plane acknowledgement. Reopen a
      // follower on disk and move leadership there while the grant is retained.
      const releaseIndex = initialLeader.raft.readStatus().appliedIndex;
      assert.ok(await group.waitFor(() =>
        thirdReplica.raft.readStatus().appliedIndex >= releaseIndex));
      await thirdReplica.shutdown();
      thirdReplica = await group.reopen(2);
      await transferGroupLeadership(group, initialLeader, thirdReplica);
      await settleGroupLeader(group, thirdReplica);
      thirdReplica.sqlQueryEngine = {managedSplitWorkflow: releaseOwner};
      assert.equal(readDurableMirrorRetentionCustodyIn(thirdReplica.db), null);
      await assert.rejects(replicateSourceMirrorRetentionCustody(thirdReplica, abortedMeta,
        {family: 'split', barrierIndex: 0}), /custody commitment unconfirmed/u);
      thirdReplica.systemTableCache.applySystemTableChange('tables', 'UPDATE', terminalRow());
      allowAck = true;
      await reconcileFailedMirrorCustody(thirdReplica);
      assert.deepEqual(terminalMetadata.mirrorCustodyGrants, []);
      await transferGroupLeadership(group, thirdReplica, initialLeader);
      await settleGroupLeader(group, initialLeader);
      assert.ok(await group.waitFor(() =>
        group.services.every((service) => !service.splitReplication)),
      'committed release retires the failed handle on the former leader before participant admission');
      await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
      assert.equal((await initialLeader.applyWrite({
        type: PARTITION_SERVICE_OPERATION.UPDATE,
        sql: `UPDATE ${userTableName} SET representative_node_id = ? WHERE group_id = ?`,
        params: ['node-0', 'A-seed'], entryId: 'entry-reset-seed-after-abort',
      })).success, true);

      const leftChild = await openChildPartition('orders-left');
      const rightChild = await openChildPartition('orders-right');
      const childById = new Map([['orders-left', leftChild], ['orders-right', rightChild]]);
      const activeMeta = {
        ...refusedMeta, workflowId: 'wf-split-no-dml-held-catchup', workflowAttempt: 3, workflowFenceToken: 3,
      };
      for (const targetId of ['orders-left', 'orders-right']) {
        initialLeader.systemTableCache.applySystemTableChange('partitions', 'INSERT', {
          partition_id: targetId, table_name: userTableName, partition_version: 2,
        });
      }
      initialLeader.systemTableCache.applySystemTableChange('tables', 'UPDATE', {
        table_id: userTableName, table_name: userTableName, active_partition_version: 1,
        pending_partition_version: 2, partition_transition_state: 'split_backfilling',
        partition_transition_metadata: JSON.stringify(activeMeta),
      });
      let heldCheckpoint = null;
      initialLeader.sqlQueryEngine = {
        queryExecutor: {
          async executeOnPartition(targetPartitionId, sql, params, _r, _w, _tx, options) {
            return childById.get(targetPartitionId).applyWrite({
              type: PARTITION_SERVICE_OPERATION.QUERY, sql, params, entryId: options?.entryId,
            });
          },
        },
        managedSplitWorkflow: {
          reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
          async acknowledgeSourceParticipant(_wfId, ack) {
            if (ack.status === 'snapshot_started') return {result: 'accepted'};
            if (ack.status === 'catchup_ready') {
              heldCheckpoint = ack.checkpoint;
              throw new Error('cutover failed after checkpoint acceptance');
            }
            return {result: 'accepted', splitSourceRetired: true};
          },
        },
      };
      assert.equal((await initialLeader.handleStartSplitReplication({
        partitionId, tableId: userTableName, tableName: userTableName,
        transitionMetadata: activeMeta,
      })).success, true);
      await initialLeader.splitReplicationRun;
      assert.ok(heldCheckpoint, 'CATCHUP_READY checkpoint recorded with zero DML during backfill');
      const heldBarrierIndex = readDurableMirrorRetentionCustodyIn(initialLeader.db).barrierIndex;
      assert.ok(heldBarrierIndex <= heldCheckpoint.replayWatermarkIndex);
      const leaderAppliedBeforeTransfer = initialLeader.raft.readStatus().appliedIndex;
      assert.equal(
        await group.waitFor(() => group.services.every((svc) =>
          svc.raft.readStatus().appliedIndex >= leaderAppliedBeforeTransfer &&
          readDurableMirrorRetentionCustodyIn(svc.db)?.workflowId === activeMeta.workflowId &&
          readDurableMirrorRetentionCustodyIn(svc.db)?.barrierIndex === heldBarrierIndex)),
        true,
      );

      const childQueryExecutor = initialLeader.sqlQueryEngine.queryExecutor;
      initialLeader.systemTableCache.applySystemTableChange('tables', 'UPDATE', {
        table_id: userTableName, table_name: userTableName, active_partition_version: 1,
        pending_partition_version: null, partition_transition_state: 'active',
        partition_transition_metadata: null,
      });
      await transferGroupLeadership(group, initialLeader, follower);
      await settleGroupLeader(group, follower);
      await initialLeader.shutdown();
      const reopenedSource = await group.reopen(0);
      assertDurableCustodyField(reopenedSource.db, 'workflowId',
        activeMeta.workflowId, 'loss of the volatile worker preserves the committed obligation');
      await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
      assert.equal(
        follower.systemTableCache.get('tables', userTableName)?.partition_transition_state,
        'active',
      );

      assert.equal((await follower.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: `INSERT INTO ${userTableName} (group_id, representative_node_id) VALUES (?, ?), (?, ?)`,
        params: ['B-early', 'node-1', 'Z-early', 'node-1'], entryId: 'entry-follower-stale-1',
      })).success, true);
      assert.equal((await follower.applyWrite({
        type: PARTITION_SERVICE_OPERATION.UPDATE,
        sql: `UPDATE ${userTableName} SET representative_node_id = ? WHERE representative_node_id = ?`,
        params: ['node-2', 'node-1'], entryId: 'entry-follower-stale-broad-update',
      })).success, true);
      assert.equal((await follower.applyWrite({
        type: PARTITION_SERVICE_OPERATION.DELETE,
        sql: `DELETE FROM ${userTableName} WHERE group_id = trim(?)`,
        params: [' Z-early '], entryId: 'entry-follower-stale-trim-delete',
      })).success, true);

      const postBarrierBulkCount = STEADY_STATE_MIRROR_EFFECT_RETENTION_WINDOW + 50;
      for (let i = 1; i <= postBarrierBulkCount; i += 1) {
        assert.equal((await follower.applyWrite({
          type: PARTITION_SERVICE_OPERATION.INSERT,
          sql: `INSERT INTO ${userTableName} (group_id, representative_node_id) VALUES (?, ?)`,
          params: [`N-bulk-${String(i).padStart(4, '0')}`, 'node-bulk'],
          entryId: `entry-follower-bulk-${i}`,
        })).success, true);
      }

      const activeCadence = createPartitionSnapshotCadence({service: follower, entryThreshold: 1});
      const activeTick = await activeCadence.tick(Date.now());
      assert.equal(activeTick.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        [activeTick.detail, activeTick.cause, activeTick.stack].filter(Boolean).join('\n'));
      assert.ok(activeTick.checkpointedIndex > heldBarrierIndex);
      assert.equal(activeTick.compactedIndex, heldBarrierIndex);
      assert.equal(activeTick.compactedUpToIndex, heldBarrierIndex);
      assert.equal(
        readCheckpoint({checkpointDir: activeTick.creation.checkpointDir}).outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      );

      const thirdDbPath = group.dbFileOf(members[2]);
      const thirdCheckpointsRoot = resolveReplicaCheckpointsRoot(thirdDbPath);
      fs.mkdirSync(thirdCheckpointsRoot, {recursive: true});
      fs.cpSync(
        activeTick.creation.checkpointDir,
        path.join(thirdCheckpointsRoot, String(activeTick.checkpointedIndex)),
        {recursive: true},
      );
      await thirdReplica.shutdown();
      const installOutcome = await requestSnapshotInstall({
        replicaDbPath: thirdDbPath, checkpointsRoot: thirdCheckpointsRoot,
        generationIndex: activeTick.checkpointedIndex,
        expectedIdentity: activeTick.creation.descriptor,
        expectedReplicaIdentity: thirdReplica.replicaId,
      });
      assert.equal(installOutcome.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED);
      const installed = await group.reopen(2);
      assertDurableCustodyField(installed.db, 'workflowId',
        activeMeta.workflowId);
      assert.ok(installed.db.prepare(countPositiveEffectsSql).get().count > postBarrierBulkCount);
      await transferGroupLeadership(group, follower, installed);
      await settleGroupLeader(group, installed);
      await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
      assert.equal((await installed.applyWrite({
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: `INSERT INTO ${userTableName} (group_id, representative_node_id) VALUES (?, ?)`,
        params: ['Z-post-install', 'node-installed'], entryId: 'entry-post-install',
      })).success, true);

      for (const targetId of ['orders-left', 'orders-right']) {
        installed.systemTableCache.applySystemTableChange('partitions', 'INSERT', {
          partition_id: targetId, table_name: userTableName, partition_version: 2,
        });
      }
      const splitMetadataWithCheckpoint = {...activeMeta, sourceCheckpoint: heldCheckpoint};
      installed.systemTableCache.applySystemTableChange('tables', 'UPDATE', {
        table_id: userTableName, table_name: userTableName,
        active_partition_version: 1, pending_partition_version: 2,
        partition_transition_state: 'split_catchup',
        partition_transition_metadata: JSON.stringify(splitMetadataWithCheckpoint),
      });
      installed.sqlQueryEngine = {
        queryExecutor: childQueryExecutor,
        managedSplitWorkflow: {
          reserveSourceMirrorCustody: sourceMirrorReservationFixture(),
          readAuthoritativeWorkflowRecord: async () => ({...terminalRow(),
            partition_transition_state: 'split_cutover_active',
            partition_transition_metadata: JSON.stringify(terminalMetadata)}),
          getControlPlaneSystemTableGateway: releaseOwner.getControlPlaneSystemTableGateway,
          async acknowledgeSourceParticipant(_workflowId, ack) {
            if (ack.status === 'cleanup_completed') {
              terminalMetadata = {...activeMeta, mirrorCustodyGrants: [
                {partitionId, fence: activeMeta.workflowFenceToken, acquired: true, release: true},
              ]};
            }
            return {
              result: 'accepted',
              splitCutoverApplied: ack.status === 'catchup_ready',
              splitSourceRetired: ack.status === 'cleanup_completed',
              terminalCustody: {...activeMeta, family: 'split'},
            };
          },
        },
      };
      assert.equal(await installed.startOrResumeSplitReplicationFromDurable(), true);
      await installed.splitReplicationRun;

      const selectChildRowsSql =
        `SELECT group_id, representative_node_id FROM ${userTableName} ORDER BY group_id`;
      const leftRows = leftChild.db.prepare(selectChildRowsSql).all();
      const rightRows = rightChild.db.prepare(selectChildRowsSql).all();
      assert.deepEqual(leftRows, [
        {group_id: 'A-seed', representative_node_id: 'node-0'},
        {group_id: 'B-early', representative_node_id: 'node-2'},
      ]);
      assert.equal(rightRows.some((r) => r.group_id === 'Z-early'), false);
      assert.equal(rightRows.length, postBarrierBulkCount + 1);
      assert.ok(rightRows.some((r) => r.group_id === 'Z-post-install'));
      assert.equal(readDurableMirrorRetentionCustodyIn(installed.db), null);
      assert.equal(installed.db.prepare(countPositiveEffectsSql).get().count, 0);
    } finally {
      for (const child of childServices) await child.shutdown();
      fs.rmSync(childDir, {recursive: true, force: true});
      await group.dispose();
      resetEnvironment();
    }
  },
);
