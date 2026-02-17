import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  PlaybackRecorder,
  diffTopologySnapshots,
} from '../playback-recorder.js';

const EVENT_TYPE_REPLICA_MOVED = 'replica.moved';
const EVENT_TYPE_PARTITION_SPLIT = 'partition.split';
const EVENT_TYPE_PARTITION_MERGE = 'partition.merge';
const EVENT_TYPE_REPLICA_CREATED = 'replica.created';

test('diffTopologySnapshots detects replica move', async () => {
  const previous = {
    timestamp: 1,
    nodes: [],
    partitions: [],
    services: [{
      service_id: 'svc-1',
      partition_id: 'p-1',
      node_id: 'node-a',
      status: 'active',
    }],
  };
  const current = {
    timestamp: 2,
    nodes: [],
    partitions: [],
    services: [{
      service_id: 'svc-1',
      partition_id: 'p-1',
      node_id: 'node-b',
      status: 'active',
    }],
  };

  const events = diffTopologySnapshots(previous, current);
  const moved = events.find((event) =>
    event.type === EVENT_TYPE_REPLICA_MOVED,
  );

  assert.ok(moved, 'expected replica.moved event');
  assert.equal(moved.entityId, 'svc-1');
  assert.equal(moved.details.fromNodeId, 'node-a');
  assert.equal(moved.details.toNodeId, 'node-b');
});

test('diffTopologySnapshots infers partition split and merge', async () => {
  const splitPrevious = {
    timestamp: 10,
    nodes: [],
    partitions: [{
      partition_id: 'parent-p',
      table_id: 't-1',
      table_name: 'logs',
      partition_key_start: 'a',
      partition_key_end: 'z',
    }],
    services: [],
  };
  const splitCurrent = {
    timestamp: 11,
    nodes: [],
    partitions: [{
      partition_id: 'child-left',
      table_id: 't-1',
      table_name: 'logs',
      partition_key_start: 'a',
      partition_key_end: 'm',
    }, {
      partition_id: 'child-right',
      table_id: 't-1',
      table_name: 'logs',
      partition_key_start: 'm',
      partition_key_end: 'z',
    }],
    services: [],
  };

  const splitEvents = diffTopologySnapshots(
    splitPrevious,
    splitCurrent,
  );
  const split = splitEvents.find((event) =>
    event.type === EVENT_TYPE_PARTITION_SPLIT,
  );
  assert.ok(split, 'expected partition.split event');
  assert.equal(split.entityId, 'parent-p');
  assert.deepEqual(
    split.details.childPartitionIds.sort(),
    ['child-left', 'child-right'].sort(),
  );

  const mergePrevious = splitCurrent;
  const mergeCurrent = splitPrevious;
  const mergeEvents = diffTopologySnapshots(
    mergePrevious,
    mergeCurrent,
  );
  const merge = mergeEvents.find((event) =>
    event.type === EVENT_TYPE_PARTITION_MERGE,
  );
  assert.ok(merge, 'expected partition.merge event');
  assert.equal(merge.entityId, 'parent-p');
  assert.deepEqual(
    merge.details.parentPartitionIds.sort(),
    ['child-left', 'child-right'].sort(),
  );
});

test('diffTopologySnapshots infers replica events from replica operations', async () => {
  const previous = {
    timestamp: 1,
    nodes: [],
    partitions: [],
    services: [],
    replicaOperations: [],
  };
  const current = {
    timestamp: 2,
    nodes: [],
    partitions: [],
    services: [],
    replicaOperations: [{
      operation_id: 'op-1',
      type: 'REPLACE',
      partition_id: 'p-1',
      replica_id: 'p-1-r1',
      source_node_id: 'node-a',
      target_node_id: 'node-b',
      status: 'active',
    }, {
      operation_id: 'op-2',
      type: 'ADD',
      partition_id: 'p-2',
      replica_id: 'p-2-r1',
      target_node_id: 'node-c',
      status: 'pending',
    }],
  };

  const events = diffTopologySnapshots(previous, current);
  const moved = events.find((event) =>
    event.type === EVENT_TYPE_REPLICA_MOVED &&
    event.entityId === 'p-1-r1',
  );
  const created = events.find((event) =>
    event.type === EVENT_TYPE_REPLICA_CREATED &&
    event.entityId === 'p-2-r1',
  );

  assert.ok(moved, 'expected replica.moved event derived from REPLACE operation');
  assert.equal(moved.details.fromNodeId, 'node-a');
  assert.equal(moved.details.toNodeId, 'node-b');
  assert.equal(moved.details.operationId, 'op-1');
  assert.equal(moved.details.source, 'replica_operations');

  assert.ok(created, 'expected replica.created event derived from ADD operation');
  assert.equal(created.details.nodeId, 'node-c');
  assert.equal(created.details.partitionId, 'p-2');
  assert.equal(created.details.operationId, 'op-2');
  assert.equal(created.details.source, 'replica_operations');
});

test('PlaybackRecorder writes playback artifacts and manifest', async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), 'playback-recorder-test-'),
  );

  const node = {
    id: 'node-1',
    containerId: 'container-1',
    _dockerProvider: {
      async getContainerStats() {
        return {
          cpuPercent: 22.1,
          memoryUsageBytes: 1024,
          memoryLimitBytes: 4096,
          rxBytes: 10,
          txBytes: 11,
        };
      },
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {
          rows: [{
            node_id: 'node-1',
            status: 'active',
          }],
        };
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [{
            partition_id: 'p-1',
            table_id: 't-1',
            table_name: 'logs',
            partition_key_start: 'a',
            partition_key_end: 'z',
          }],
        };
      }
      return {
        rows: [{
          service_id: 'svc-1',
          node_id: 'node-1',
          partition_id: 'p-1',
          status: 'active',
        }],
      };
    },
  };

  const cluster = {
    getNodes() {
      return [node];
    },
  };

  const recorder = new PlaybackRecorder({
    outputDir,
    topologyPollIntervalMs: 60000,
    resourcePollIntervalMs: 60000,
  });

  try {
    await recorder.start({
      scenarioName: 'scenario-a',
      cluster,
    });
    recorder.recordEvent({
      type: 'test.event',
      scope: 'test',
      entityId: 'entity-1',
      details: {ok: true},
    });

    const manifest = await recorder.stop({
      reason: 'test',
    });
    assert.ok(manifest, 'manifest should be returned');
    assert.ok(manifest.files.events);
    assert.ok(manifest.files.samples);
    assert.ok(manifest.files.snapshots);
    assert.ok(manifest.files.manifest);
    assert.ok(manifest.files.viewer);
    assert.ok(manifest.counts.events >= 2);
    assert.ok(manifest.counts.samples >= 1);
    assert.ok(manifest.counts.snapshots >= 1);

    const eventContent = await readFile(
      manifest.files.events,
      'utf8',
    );
    const sampleContent = await readFile(
      manifest.files.samples,
      'utf8',
    );
    const snapshotContent = await readFile(
      manifest.files.snapshots,
      'utf8',
    );
    const viewerContent = await readFile(
      manifest.files.viewer,
      'utf8',
    );
    assert.ok(eventContent.includes('cluster.start'));
    assert.ok(sampleContent.includes('memoryUsageBytes'));
    assert.ok(snapshotContent.includes('partitions'));
    assert.ok(viewerContent.includes('Playback Viewer'));
  } finally {
    await rm(outputDir, {recursive: true, force: true});
  }
});

test('PlaybackRecorder aggregates service rows across reachable nodes', async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), 'playback-recorder-multi-node-'),
  );

  const makeNode = (id, serviceRows) => ({
    id,
    containerId: `container-${id}`,
    _dockerProvider: {
      async getContainerStats() {
        return {
          cpuPercent: 10,
          memoryUsageBytes: 2048,
          memoryLimitBytes: 4096,
          rxBytes: 10,
          txBytes: 12,
        };
      },
    },
    async isReachable() {
      return true;
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {
          rows: [{
            node_id: 'node-a',
            status: 'active',
          }, {
            node_id: 'node-b',
            status: 'active',
          }],
        };
      }
      if (sql.includes('FROM partitions')) {
        return {
          rows: [{
            partition_id: 'p-1',
            table_id: 't-1',
            table_name: 'logs',
            partition_key_start: 'a',
            partition_key_end: 'z',
          }],
        };
      }
      return {rows: serviceRows};
    },
  });

  const nodeA = makeNode('node-a', [{
    service_id: 'svc-1',
    node_id: 'node-a',
    partition_id: 'p-1',
    updated_at: 100,
    status: 'active',
  }, {
    service_id: 'svc-2',
    node_id: 'node-a',
    partition_id: 'p-1',
    updated_at: 100,
    status: 'active',
  }]);
  const nodeB = makeNode('node-b', [{
    service_id: 'svc-2',
    node_id: 'node-b',
    partition_id: 'p-1',
    updated_at: 200,
    status: 'active',
  }, {
    service_id: 'svc-3',
    node_id: 'node-b',
    partition_id: 'p-1',
    updated_at: 200,
    status: 'active',
  }]);

  const cluster = {
    getNodes() {
      return [nodeA, nodeB];
    },
  };

  const recorder = new PlaybackRecorder({
    outputDir,
    topologyPollIntervalMs: 60000,
    resourcePollIntervalMs: 60000,
  });

  try {
    await recorder.start({
      scenarioName: 'multi-node-services',
      cluster,
    });
    const manifest = await recorder.stop({
      reason: 'multi-node-service-snapshot',
    });
    const snapshotContent = await readFile(
      manifest.files.snapshots,
      'utf8',
    );
    const snapshots = snapshotContent
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
    const lastSnapshot = snapshots[snapshots.length - 1];
    const serviceNodeIds = Array.from(new Set(
      (lastSnapshot.services || [])
        .map((service) => service.node_id)
        .filter((nodeId) => Boolean(nodeId)),
    )).sort();
    assert.deepEqual(
      serviceNodeIds,
      ['node-a', 'node-b'],
      'snapshot should include partition replicas from both nodes',
    );
    const duplicateSvc2Count = (lastSnapshot.services || [])
      .filter((service) => service.service_id === 'svc-2')
      .length;
    assert.equal(
      duplicateSvc2Count,
      1,
      'snapshot should dedupe duplicate service rows by service_id',
    );
    const svc2 = (lastSnapshot.services || [])
      .find((service) => service.service_id === 'svc-2');
    assert.ok(svc2, 'snapshot should include svc-2');
    assert.equal(
      svc2.node_id,
      'node-b',
      'snapshot should keep latest service row when node assignment conflicts',
    );
  } finally {
    await rm(outputDir, {recursive: true, force: true});
  }
});

test('PlaybackRecorder defers topology capture until admin readiness is observed',
  async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), 'playback-recorder-admin-ready-'),
    );

    let queryCallCount = 0;
    const node = {
      id: 'node-1',
      containerId: 'container-1',
      _dockerProvider: {
        async getContainerStats() {
          return {
            cpuPercent: 11.5,
            memoryUsageBytes: 1024,
            memoryLimitBytes: 4096,
            rxBytes: 4,
            txBytes: 9,
          };
        },
      },
      async getReachabilityDiagnostics() {
        return {
          nodeId: 'node-1',
          reachable: false,
          adminReady: false,
          bootstrapHealth: {
            attempted: true,
            ok: true,
            statusCode: 200,
          },
          adminHealth: {
            attempted: true,
            ok: false,
            statusCode: -1,
            error: 'http_status_-1',
          },
          adminWs: {
            attempted: true,
            ok: false,
            error: 'connect ECONNREFUSED',
          },
          sqlProbe: {
            attempted: false,
            ok: false,
            query: 'SELECT node_id FROM nodes LIMIT 1',
          },
          lastError: 'connect ECONNREFUSED',
        };
      },
      async query() {
        queryCallCount++;
        throw new Error('query should not run before admin readiness');
      },
    };

    const cluster = {
      getNodes() {
        return [node];
      },
    };

    const recorder = new PlaybackRecorder({
      outputDir,
      topologyPollIntervalMs: 60000,
      resourcePollIntervalMs: 60000,
    });

    try {
      await recorder.start({
        scenarioName: 'admin-readiness-defer',
        cluster,
      });

      const manifest = await recorder.stop({
        reason: 'admin-not-ready',
      });
      const warningCodes = (manifest.warnings || [])
        .map((warning) => warning.code);

      assert.equal(
        queryCallCount,
        0,
        'topology queries should be deferred before admin readiness',
      );
      assert.equal(
        warningCodes.includes('query-node-unavailable'),
        false,
        'should not emit unreachable warnings before admin readiness',
      );
    } finally {
      await rm(outputDir, {recursive: true, force: true});
    }
  });

test('PlaybackRecorder truncates scenario playback files on new run', async () => {
  const outputDir = await mkdtemp(
    join(tmpdir(), 'playback-recorder-truncate-'),
  );

  const node = {
    id: 'node-1',
    containerId: 'container-1',
    _dockerProvider: {
      async getContainerStats() {
        return {
          cpuPercent: 5,
          memoryUsageBytes: 512,
          memoryLimitBytes: 2048,
          rxBytes: 1,
          txBytes: 2,
        };
      },
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {rows: [{node_id: 'node-1', status: 'active'}]};
      }
      if (sql.includes('FROM partitions')) {
        return {rows: []};
      }
      return {rows: []};
    },
  };

  const cluster = {
    getNodes() {
      return [node];
    },
  };

  const firstRecorder = new PlaybackRecorder({
    outputDir,
    topologyPollIntervalMs: 60000,
    resourcePollIntervalMs: 60000,
  });
  const secondRecorder = new PlaybackRecorder({
    outputDir,
    topologyPollIntervalMs: 60000,
    resourcePollIntervalMs: 60000,
  });

  try {
    await firstRecorder.start({
      scenarioName: 'scenario-reused',
      cluster,
    });
    firstRecorder.recordEvent({
      type: 'test.first',
      scope: 'test',
      entityId: 'run-1',
      details: {marker: 'first-run'},
    });
    const firstManifest = await firstRecorder.stop({
      reason: 'first-run',
    });

    await secondRecorder.start({
      scenarioName: 'scenario-reused',
      cluster,
    });
    secondRecorder.recordEvent({
      type: 'test.second',
      scope: 'test',
      entityId: 'run-2',
      details: {marker: 'second-run'},
    });
    const secondManifest = await secondRecorder.stop({
      reason: 'second-run',
    });

    const eventContent = await readFile(
      secondManifest.files.events,
      'utf8',
    );
    assert.ok(
      !eventContent.includes('test.first'),
      'second run event file should not include prior run event rows',
    );
    assert.ok(
      eventContent.includes('test.second'),
      'second run event file should include current run events',
    );
    assert.equal(
      firstManifest.files.events,
      secondManifest.files.events,
      'test should verify truncation even when both runs target same file',
    );
  } finally {
    await rm(outputDir, {recursive: true, force: true});
  }
});
