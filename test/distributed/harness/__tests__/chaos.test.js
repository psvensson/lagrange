/**
 * Unit tests for ChaosPrimitives.
 *
 * Feature: distributed-testing-framework
 * Tests each primitive delegates to the correct Docker Provider method,
 * verifies network partition topology, heal restores connectivity,
 * slowNetwork generates correct tc commands, clear restores network qdisc,
 * disk pressure can be applied/released, and corruptDisk uses dd.
 *
 * **Validates: Requirements 4.1, 4.2, 4.7, 4.8**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {ChaosPrimitives} from '../chaos.js';

/**
 * Create a mock DockerProvider that records all calls.
 * Each method resolves immediately and pushes a call record.
 */
function createMockProvider() {
  const calls = [];
  let inspectCount = 0;
  const inspectResponses = [
    {
      Name: '/ddb-test-reuse-3-2',
      Config: {
        Env: [
          'NODE_ADDRESS=ddb-test-reuse-3-2:8080',
        ],
      },
      State: {Status: 'running'},
      NetworkSettings: {
        Networks: {
          'cluster-main': {
            NetworkID: MAIN_NETWORK_ID,
            IPAddress: '172.18.0.2',
            Aliases: ['ddb-test-reuse-3-2'],
          },
        },
      },
    },
  ];
  return {
    calls,
    inspectResponses,
    killContainer: async (id) => {
      calls.push({method: 'killContainer', args: [id]});
    },
    stopContainer: async (id) => {
      calls.push({method: 'stopContainer', args: [id]});
    },
    pauseContainer: async (id) => {
      calls.push({method: 'pauseContainer', args: [id]});
    },
    unpauseContainer: async (id) => {
      calls.push({method: 'unpauseContainer', args: [id]});
    },
    restartContainer: async (id) => {
      calls.push({method: 'restartContainer', args: [id]});
    },
    startContainer: async (id) => {
      calls.push({method: 'startContainer', args: [id]});
    },
    inspectContainer: async (id) => {
      calls.push({method: 'inspectContainer', args: [id]});
      const index = Math.min(inspectCount, inspectResponses.length - 1);
      inspectCount += 1;
      return inspectResponses[index];
    },
    execInContainer: async (id, cmd) => {
      calls.push({method: 'execInContainer', args: [id, cmd]});
    },
    createNetwork: async (name) => {
      const net = {id: `net-${calls.length}`, name};
      calls.push({method: 'createNetwork', args: [name], result: net});
      return net;
    },
    disconnectFromNetwork: async (netId, containerId) => {
      calls.push({
        method: 'disconnectFromNetwork',
        args: [netId, containerId],
      });
    },
    connectToNetwork: async (netId, containerId, aliases = []) => {
      calls.push({
        method: 'connectToNetwork',
        args: [netId, containerId, aliases],
      });
    },
    removeNetwork: async (netId) => {
      calls.push({method: 'removeNetwork', args: [netId]});
    },
  };
}

/**
 * Create a mock nodes Map with containerId properties.
 */
function createMockNodes() {
  return new Map([
    ['node-1', {containerId: 'container-aaa'}],
    ['node-2', {containerId: 'container-bbb'}],
    ['node-3', {containerId: 'container-ccc'}],
  ]);
}

const MAIN_NETWORK_ID = 'main-net-123';

// --- Simple delegation tests (Req 4.1, 4.2) ---

test('killNode delegates to dockerProvider.killContainer', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.killNode('node-1');

  assert.strictEqual(provider.calls.length, 1);
  assert.strictEqual(provider.calls[0].method, 'killContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-aaa');
});

test('stopNode delegates to dockerProvider.stopContainer', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.stopNode('node-2');

  assert.strictEqual(provider.calls.length, 1);
  assert.strictEqual(provider.calls[0].method, 'stopContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-bbb');
});

test('pauseNode delegates to dockerProvider.pauseContainer', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.pauseNode('node-3');

  assert.strictEqual(provider.calls.length, 1);
  assert.strictEqual(provider.calls[0].method, 'pauseContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-ccc');
});

test('unpauseNode delegates to dockerProvider.unpauseContainer', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.unpauseNode('node-1');

  assert.strictEqual(provider.calls.length, 1);
  assert.strictEqual(provider.calls[0].method, 'unpauseContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-aaa');
});

test('restartNode republishes main-network alias after restart', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.restartNode('node-2');

  assert.strictEqual(provider.calls[0].method, 'restartContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-bbb');
  assert.strictEqual(provider.calls[1].method, 'inspectContainer');
  assert.strictEqual(provider.calls[1].args[0], 'container-bbb');
  assert.strictEqual(provider.calls[2].method, 'disconnectFromNetwork');
  assert.deepStrictEqual(provider.calls[2].args, [
    MAIN_NETWORK_ID,
    'container-bbb',
  ]);
  assert.strictEqual(provider.calls[3].method, 'connectToNetwork');
  assert.deepStrictEqual(provider.calls[3].args, [
    MAIN_NETWORK_ID,
    'container-bbb',
    ['ddb-test-reuse-3-2'],
  ]);
  assert.strictEqual(provider.calls[4].method, 'inspectContainer');
  assert.strictEqual(provider.calls[4].args[0], 'container-bbb');
  assert.strictEqual(nodes.get('node-2').ip, '172.18.0.2');
});

test('startNode republishes main-network alias after start', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.startNode('node-2');

  assert.strictEqual(provider.calls[0].method, 'startContainer');
  assert.strictEqual(provider.calls[0].args[0], 'container-bbb');
  assert.strictEqual(provider.calls[1].method, 'inspectContainer');
  assert.strictEqual(provider.calls[1].args[0], 'container-bbb');
  assert.strictEqual(provider.calls[2].method, 'disconnectFromNetwork');
  assert.deepStrictEqual(provider.calls[2].args, [
    MAIN_NETWORK_ID,
    'container-bbb',
  ]);
  assert.strictEqual(provider.calls[3].method, 'connectToNetwork');
  assert.deepStrictEqual(provider.calls[3].args, [
    MAIN_NETWORK_ID,
    'container-bbb',
    ['ddb-test-reuse-3-2'],
  ]);
  assert.strictEqual(provider.calls[4].method, 'inspectContainer');
  assert.strictEqual(provider.calls[4].args[0], 'container-bbb');
  assert.strictEqual(nodes.get('node-2').ip, '172.18.0.2');
});

test('restartNode reconnects main-network alias when missing after restart', async () => {
  const provider = createMockProvider();
  provider.inspectResponses.splice(
    0,
    provider.inspectResponses.length,
    {
      Name: '/ddb-test-reuse-3-2',
      Config: {
        Env: [
          'NODE_ADDRESS=ddb-test-reuse-3-2:8080',
        ],
      },
      State: {Status: 'running'},
      NetworkSettings: {
        Networks: {
          'cluster-main': {
            NetworkID: MAIN_NETWORK_ID,
            IPAddress: '172.18.0.22',
            Aliases: [],
          },
        },
      },
    },
    {
      Name: '/ddb-test-reuse-3-2',
      Config: {
        Env: [
          'NODE_ADDRESS=ddb-test-reuse-3-2:8080',
        ],
      },
      State: {Status: 'running'},
      NetworkSettings: {
        Networks: {
          'cluster-main': {
            NetworkID: MAIN_NETWORK_ID,
            IPAddress: '172.18.0.22',
            Aliases: ['ddb-test-reuse-3-2'],
          },
        },
      },
    },
  );
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.restartNode('node-2');

  const disconnectCall = provider.calls.find(
    (call) => call.method === 'disconnectFromNetwork',
  );
  const connectCall = provider.calls.find(
    (call) => call.method === 'connectToNetwork',
  );

  assert.ok(disconnectCall, 'restart should detach stale main-network endpoint');
  assert.deepStrictEqual(disconnectCall.args, [
    MAIN_NETWORK_ID,
    'container-bbb',
  ]);
  assert.ok(connectCall, 'restart should restore the hostname alias on reattach');
  assert.deepStrictEqual(connectCall.args, [
    MAIN_NETWORK_ID,
    'container-bbb',
    ['ddb-test-reuse-3-2'],
  ]);
  assert.strictEqual(nodes.get('node-2').ip, '172.18.0.22');
});

test('restartNode skips main-network reattach while an isolation partition is active',
  async () => {
    const provider = createMockProvider();
    const nodes = createMockNodes();
    const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);
    chaos._isolationState = {
      isoNetA: {id: 'iso-a'},
      isoNetB: {id: 'iso-b'},
      groupA: ['node-1'],
      groupB: ['node-2', 'node-3'],
    };

    await chaos.restartNode('node-2');

    assert.strictEqual(provider.calls[0].method, 'restartContainer');
    assert.strictEqual(provider.calls[1].method, 'inspectContainer');
    assert.strictEqual(
      provider.calls.some((call) => call.method === 'disconnectFromNetwork'),
      false,
      'restart should not silently rejoin the main network during an isolation partition',
    );
    assert.strictEqual(
      provider.calls.some((call) => call.method === 'connectToNetwork'),
      false,
      'restart should not republish the main-network alias while partition isolation is active',
    );
  },
);

// --- Unknown nodeId throws error ---

test('throws error for unknown nodeId', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await assert.rejects(
    () => chaos.killNode('node-unknown'),
    (err) => {
      assert.ok(
        err.message.includes('node-unknown'),
        'error should include the unknown node ID',
      );
      assert.ok(
        err.message.includes('not found'),
        'error should indicate node was not found',
      );
      return true;
    },
  );
});

// --- partitionNetwork creates correct topology (Req 4.5) ---

test('partitionNetwork creates isolation networks and topology', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.partitionNetwork(['node-1'], ['node-2', 'node-3']);

  // Filter calls by method
  const createNetCalls = provider.calls.filter(
    (c) => c.method === 'createNetwork',
  );
  const disconnectCalls = provider.calls.filter(
    (c) => c.method === 'disconnectFromNetwork',
  );
  const connectCalls = provider.calls.filter(
    (c) => c.method === 'connectToNetwork',
  );

  // Should create 2 isolation networks
  assert.strictEqual(
    createNetCalls.length, 2,
    'should create 2 isolation networks',
  );
  assert.ok(
    createNetCalls[0].args[0].includes('iso'),
    'first isolation network name should contain iso prefix',
  );
  assert.ok(
    createNetCalls[1].args[0].includes('iso'),
    'second isolation network name should contain iso prefix',
  );

  // Should disconnect all 3 nodes from main network
  assert.strictEqual(
    disconnectCalls.length, 3,
    'should disconnect all nodes from main network',
  );
  for (const call of disconnectCalls) {
    assert.strictEqual(
      call.args[0], MAIN_NETWORK_ID,
      'disconnect should target main network',
    );
  }
  const disconnectedContainers = disconnectCalls.map((c) => c.args[1]);
  assert.ok(disconnectedContainers.includes('container-aaa'));
  assert.ok(disconnectedContainers.includes('container-bbb'));
  assert.ok(disconnectedContainers.includes('container-ccc'));

  // groupA (node-1) connects to first isolation net
  // groupB (node-2, node-3) connects to second isolation net
  assert.strictEqual(
    connectCalls.length, 3,
    'should connect 3 nodes to isolation networks',
  );

  const isoNetAId = createNetCalls[0].result.id;
  const isoNetBId = createNetCalls[1].result.id;

  // node-1 → isoNetA
  const groupAConnects = connectCalls.filter(
    (c) => c.args[0] === isoNetAId,
  );
  assert.strictEqual(groupAConnects.length, 1);
  assert.strictEqual(groupAConnects[0].args[1], 'container-aaa');

  // node-2, node-3 → isoNetB
  const groupBConnects = connectCalls.filter(
    (c) => c.args[0] === isoNetBId,
  );
  assert.strictEqual(groupBConnects.length, 2);
  const groupBContainers = groupBConnects.map((c) => c.args[1]);
  assert.ok(groupBContainers.includes('container-bbb'));
  assert.ok(groupBContainers.includes('container-ccc'));
});

// --- healPartition restores connectivity (Req 4.6) ---

test('healPartition restores connectivity and removes nets', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  // First partition, then heal
  await chaos.partitionNetwork(['node-1'], ['node-2', 'node-3']);

  // Capture the isolation network IDs created during partition
  const createNetCalls = provider.calls.filter(
    (c) => c.method === 'createNetwork',
  );
  const isoNetAId = createNetCalls[0].result.id;
  const isoNetBId = createNetCalls[1].result.id;

  // Clear calls to isolate heal behavior
  provider.calls.length = 0;

  await chaos.healPartition();

  const disconnectCalls = provider.calls.filter(
    (c) => c.method === 'disconnectFromNetwork',
  );
  const connectCalls = provider.calls.filter(
    (c) => c.method === 'connectToNetwork',
  );
  const removeNetCalls = provider.calls.filter(
    (c) => c.method === 'removeNetwork',
  );

  // Should disconnect groupA from isoNetA
  const groupADisconnects = disconnectCalls.filter(
    (c) => c.args[0] === isoNetAId,
  );
  assert.strictEqual(groupADisconnects.length, 1);
  assert.strictEqual(groupADisconnects[0].args[1], 'container-aaa');

  // Should disconnect groupB from isoNetB
  const groupBDisconnects = disconnectCalls.filter(
    (c) => c.args[0] === isoNetBId,
  );
  assert.strictEqual(groupBDisconnects.length, 2);
  const groupBContainers = groupBDisconnects.map((c) => c.args[1]);
  assert.ok(groupBContainers.includes('container-bbb'));
  assert.ok(groupBContainers.includes('container-ccc'));

  // Should reconnect all 3 nodes to main network
  assert.strictEqual(connectCalls.length, 3);
  for (const call of connectCalls) {
    assert.strictEqual(
      call.args[0], MAIN_NETWORK_ID,
      'reconnect should target main network',
    );
  }
  const reconnectedContainers = connectCalls.map((c) => c.args[1]);
  assert.ok(reconnectedContainers.includes('container-aaa'));
  assert.ok(reconnectedContainers.includes('container-bbb'));
  assert.ok(reconnectedContainers.includes('container-ccc'));

  // Should remove both isolation networks
  assert.strictEqual(removeNetCalls.length, 2);
  const removedIds = removeNetCalls.map((c) => c.args[0]);
  assert.ok(removedIds.includes(isoNetAId));
  assert.ok(removedIds.includes(isoNetBId));
});

test('healPartition is a no-op when no partition exists', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.healPartition();

  assert.strictEqual(
    provider.calls.length, 0,
    'should not call any provider methods when no partition exists',
  );
});

// --- slowNetwork generates correct tc commands (Req 4.7) ---

test('slowNetwork executes tc qdisc netem with latency and jitter', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.slowNetwork('node-1', {latency: 100, jitter: 25});

  assert.strictEqual(provider.calls.length, 1);
  const call = provider.calls[0];
  assert.strictEqual(call.method, 'execInContainer');
  assert.strictEqual(call.args[0], 'container-aaa');

  const cmd = call.args[1];
  assert.ok(Array.isArray(cmd), 'command should be an array');
  assert.strictEqual(cmd[0], 'tc');
  assert.ok(cmd.includes('qdisc'), 'should include qdisc');
  assert.ok(cmd.includes('replace'), 'should include replace');
  assert.ok(cmd.includes('netem'), 'should include netem');
  assert.ok(cmd.includes('delay'), 'should include delay');
  assert.ok(cmd.includes('eth0'), 'should target eth0');
  assert.ok(cmd.includes('root'), 'should use root qdisc');
  assert.ok(cmd.includes('100ms'), 'should include latency value');
  assert.ok(cmd.includes('25ms'), 'should include jitter value');
});

test('clearNetworkSlowdown removes root qdisc', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.clearNetworkSlowdown('node-2');

  assert.strictEqual(provider.calls.length, 1);
  const call = provider.calls[0];
  assert.strictEqual(call.method, 'execInContainer');
  assert.strictEqual(call.args[0], 'container-bbb');
  assert.deepStrictEqual(call.args[1], [
    'tc', 'qdisc', 'del', 'dev', 'eth0', 'root',
  ]);
});

test('clearNetworkSlowdown is idempotent when qdisc is missing', async () => {
  const provider = createMockProvider();
  provider.execInContainer = async (id, cmd) => {
    provider.calls.push({method: 'execInContainer', args: [id, cmd]});
    throw new Error('Cannot find qdisc');
  };
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.clearNetworkSlowdown('node-1');

  assert.strictEqual(provider.calls.length, 1);
  assert.strictEqual(provider.calls[0].method, 'execInContainer');
});

// --- corruptDisk generates correct dd command (Req 4.8) ---

test('corruptDisk executes dd command with correct path', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.corruptDisk('node-3', '/data/raft.db');

  assert.strictEqual(provider.calls.length, 1);
  const call = provider.calls[0];
  assert.strictEqual(call.method, 'execInContainer');
  assert.strictEqual(call.args[0], 'container-ccc');

  const cmd = call.args[1];
  assert.ok(Array.isArray(cmd), 'command should be an array');
  assert.strictEqual(cmd[0], 'dd');
  assert.ok(
    cmd.includes('if=/dev/urandom'),
    'should read from /dev/urandom',
  );
  assert.ok(
    cmd.includes('of=/data/raft.db'),
    'should write to the specified file path',
  );
  assert.ok(
    cmd.some((arg) => arg.startsWith('bs=')),
    'should specify block size',
  );
  assert.ok(
    cmd.some((arg) => arg.startsWith('count=')),
    'should specify block count',
  );
  assert.ok(
    cmd.includes('conv=notrunc'),
    'should use notrunc to corrupt in place',
  );
});

test('fillDisk writes one bounded payload file', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.fillDisk('node-1', {sizeMb: 32});

  assert.strictEqual(provider.calls.length, 2);
  assert.deepStrictEqual(provider.calls[0], {
    method: 'execInContainer',
    args: ['container-aaa', ['mkdir', '-p', '/tmp/lagrange-chaos']],
  });
  assert.strictEqual(provider.calls[1].method, 'execInContainer');
  const fillCmd = provider.calls[1].args[1];
  assert.strictEqual(fillCmd[0], 'dd');
  assert.ok(fillCmd.includes('if=/dev/zero'));
  assert.ok(fillCmd.includes('of=/tmp/lagrange-chaos/disk-pressure-node-1.bin'));
  assert.ok(fillCmd.includes('bs=1M'));
  assert.ok(fillCmd.includes('count=32'));
  assert.ok(fillCmd.includes('conv=fsync'));
});

test('releaseDiskPressure removes payload and flushes sync', async () => {
  const provider = createMockProvider();
  const nodes = createMockNodes();
  const chaos = new ChaosPrimitives(provider, nodes, MAIN_NETWORK_ID);

  await chaos.releaseDiskPressure('node-3', {
    filePath: '/tmp/lagrange-chaos/custom-pressure.bin',
  });

  assert.strictEqual(provider.calls.length, 2);
  assert.deepStrictEqual(provider.calls[0], {
    method: 'execInContainer',
    args: ['container-ccc', ['rm', '-f', '/tmp/lagrange-chaos/custom-pressure.bin']],
  });
  assert.deepStrictEqual(provider.calls[1], {
    method: 'execInContainer',
    args: ['container-ccc', ['sync']],
  });
});
