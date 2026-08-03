/**
 * Production wiring evidence for the call-cell invocation path over TWO
 * production-composed nodes (composition shared via
 * call-cell-two-node-deployment-fixture.js): the evidence is that each
 * shard-owning replica publishes its own emitted partials under its own
 * acquired slot lease, reduce executes exactly once on the replica
 * holding the dedicated reduce lease slot, and exactly one atomically
 * published final snapshot is visible — serially and under genuinely
 * overlapping parallel shard dispatch.
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {
  CALL_SERVICE_NAME,
  DECLARED_TABLE,
  EXPECTED_RESULT_JSON,
  NODE_A,
  NODE_B,
  REDUCE_LEASE_SLOT_ID,
  SECURITY_CONTEXT,
  TOP_N,
  composeTwoNodeDeployment,
} from './call-cell-two-node-deployment-fixture.js';

describe('minimal deployment call-cell production wiring', () => {
  it('spreads shard runs across two production-composed nodes and reduces ' +
    'exactly once on the reduce-lease holder', async (testContext) => {
    const {attachInvoker, messageRouter, nodes, partitionStores,
      replicaByNode} = await composeTwoNodeDeployment(testContext);
    const {invoker, serviceLifecycleCommandOwner} = attachInvoker();
    assert.equal(serviceLifecycleCommandOwner.callCellInvoker, invoker,
      'the command owner dependency is satisfied by the attachment');

    const resultJson = await invoker.invoke({
      name: CALL_SERVICE_NAME,
      argumentsJson: JSON.stringify({topN: TOP_N}),
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(resultJson, EXPECTED_RESULT_JSON,
      'the reduced top-N over both nodes matches the independently ' +
        'computed expectation');

    // Data-local placement: each shard run executed on the node hosting
    // its partition replica — driven by the partition topology, never by
    // hash luck.
    const runCounts = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) =>
        [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
    assert.deepEqual(runCounts, {[NODE_A]: 1, [NODE_B]: 1},
      'each shard run executed on its partition host node');

    // The locality contract itself: no shard-table QUERY delivery ever
    // crossed the router — the shard rows were read by each host node's
    // own partition replica, so only INVOKE messages and coordination
    // SQL used the wire.
    const shardQueryDeliveries = messageRouter.partitionQueryDeliveries
      .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE));
    assert.deepEqual(shardQueryDeliveries, [],
      'raw shard rows never left their host node before run');

    // Reduce exactly once, on the replica holding the reduce lease slot.
    const reduceCounts = Object.entries(nodes).map(([nodeId, node]) =>
      [nodeId, node.runtimeInvocationOwner.invocations.reduce.length]);
    assert.equal(
      reduceCounts.reduce((total, [, count]) => total + count, 0),
      1,
      'reduce executed exactly once across the deployment',
    );
    const slotsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_SLOTS}-p1`);
    const slotRows = slotsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_SLOTS} ` +
        'ORDER BY slot_id')
      .all();
    assert.equal(slotRows.length, 3,
      'two shard slots plus the dedicated reduce lease slot are seeded');
    const shardSlotRows = slotRows.filter(
      (row) => row.slot_id !== REDUCE_LEASE_SLOT_ID);
    assert.deepEqual(
      shardSlotRows.map((row) => row.replica_id).sort(),
      Object.values(replicaByNode).sort(),
      'each shard-owning replica published under its own slot lease',
    );
    assert.ok(
      shardSlotRows.every((row) => row.partial_json !== '[]'),
      'each shard slot carries its published emitted partial set',
    );
    const reduceLeaseRow = slotRows.find(
      (row) => row.slot_id === REDUCE_LEASE_SLOT_ID);
    const reducingNode = Object.entries(nodes).find(([, node]) =>
      node.runtimeInvocationOwner.invocations.reduce.length === 1)?.[0];
    assert.equal(
      reduceLeaseRow.replica_id,
      replicaByNode[reducingNode],
      'the replica that executed reduce holds the dedicated reduce lease',
    );

    // Exactly one atomically visible snapshot with the exact result and a
    // witness naming both shard replicas.
    const resultsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`);
    const resultRows = resultsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_RESULTS}`)
      .all();
    assert.equal(resultRows.length, 1, 'exactly one visible result row');
    assert.equal(resultRows[0].result_json, EXPECTED_RESULT_JSON);
    const witness = JSON.parse(resultRows[0].source_snapshot_json);
    assert.deepEqual(
      witness.slots.map((slot) => slot.replicaId).sort(),
      Object.values(replicaByNode).sort(),
      'the snapshot witness names both shard-owning replicas',
    );
  });

  it('overlaps shard runs across the two nodes under the bounded limit ' +
    'and returns the identical result serially and in parallel',
  async (testContext) => {
    // Cross-node rendezvous barrier: each node's run invocation parks
    // here until BOTH nodes have entered. Serial dispatch would deadlock
    // (the first run blocks the only in-flight slot), so completing the
    // invocation at all proves two run executions were genuinely in
    // flight at the same time on their partition-host nodes. The barrier
    // is armed only for the parallel invocation.
    const barrier = {armed: true, entered: [], releaseAll: null, waiters: []};
    const BARRIER_TIMEOUT_MS = 15000;
    const onRunEntered = async (nodeId) => {
      if (!barrier.armed) return;
      barrier.entered.push(nodeId);
      if (barrier.entered.length >= 2) {
        for (const release of barrier.waiters) release();
        barrier.waiters = [];
        return;
      }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(
            'no overlap: the second shard run never entered while the ' +
            'first was parked — dispatch is not parallel'));
        }, BARRIER_TIMEOUT_MS);
        timer.unref?.();
        barrier.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    };

    const {attachInvoker, messageRouter, nodes, partitionStores} =
      await composeTwoNodeDeployment(testContext, {onRunEntered});

    const telemetryRecords = [];
    const PARALLEL_LIMIT = 2;
    const {invoker: parallelInvoker} = attachInvoker({
      onInvocationTelemetry: (record) => telemetryRecords.push(record),
      tunables: {maxConcurrentShardRuns: PARALLEL_LIMIT},
    });
    const parallelResult = await parallelInvoker.invoke({
      argumentsJson: JSON.stringify({topN: TOP_N}),
      name: CALL_SERVICE_NAME,
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(parallelResult, EXPECTED_RESULT_JSON,
      'the parallel invocation reduces to the expected result');
    assert.deepEqual([...barrier.entered].sort(), [NODE_A, NODE_B].sort(),
      'both partition-host nodes entered run while the barrier held — ' +
        'two run executions overlapped in time');
    assert.equal(telemetryRecords.length, 1);
    assert.equal(telemetryRecords[0].configuredConcurrency, PARALLEL_LIMIT);
    assert.equal(telemetryRecords[0].peakConcurrentShardRuns,
      PARALLEL_LIMIT,
      'peak concurrency reached, and never exceeded, the configured limit');
    assert.equal(telemetryRecords[0].selectedPartitionCount, 2);

    // Locality is preserved under parallel dispatch: one run per
    // partition-host node and zero shard-table deliveries on the wire.
    const runCounts = Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) =>
        [nodeId, node.runtimeInvocationOwner.invocations.run.length]));
    assert.deepEqual(runCounts, {[NODE_A]: 1, [NODE_B]: 1},
      'each shard run executed on its partition host node');
    assert.deepEqual(
      messageRouter.partitionQueryDeliveries
        .filter((partitionId) => partitionId.startsWith(DECLARED_TABLE)),
      [],
      'raw shard rows never left their host node before run',
    );

    // Serial/parallel identity: the same deployment invoked with the
    // limit forced to 1 (barrier disarmed) returns the identical result.
    barrier.armed = false;
    const {invoker: serialInvoker} = attachInvoker({
      tunables: {maxConcurrentShardRuns: 1},
    });
    const serialResult = await serialInvoker.invoke({
      argumentsJson: JSON.stringify({topN: TOP_N}),
      name: CALL_SERVICE_NAME,
      securityContext: SECURITY_CONTEXT,
    });
    assert.equal(serialResult, parallelResult,
      'serial and parallel dispatch return the identical result for the ' +
        'same invocation');

    // Exactly one visible snapshot per invocation, both carrying the
    // identical reduced result.
    const resultsDb = partitionStores.databases.get(
      `${TABLES.CALL_CELL_REDUCE_RESULTS}-p1`);
    const resultRows = resultsDb
      .prepare(`SELECT * FROM ${TABLES.CALL_CELL_REDUCE_RESULTS}`)
      .all();
    assert.equal(resultRows.length, 2,
      'one visible result row per completed invocation');
    assert.ok(
      resultRows.every((row) => row.result_json === EXPECTED_RESULT_JSON),
      'every visible snapshot carries the identical reduced result',
    );
  });
});
