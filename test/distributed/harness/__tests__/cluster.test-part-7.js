/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {promises as fs} from 'node:fs';
import {resolve as resolvePath} from 'node:path';
import {validate as uuidValidate} from 'uuid';
import {
  CONTAINER_ENV_KEYS,
  createCluster,
  ENTRYPOINT_ENV,
  LABELS,
  NodeHandle,
  NODE_ROLES,
  PORTS,
  RAFT_PROVIDER_DEFAULTS,
} from './cluster-test-helpers.js';

const REUSE_START_COMMAND =
  'if [ -f /harness-control/reset-data-on-start ]; then rm -rf /data/* && ' +
  'rm -f /harness-control/reset-data-on-start; fi; ' +
  'exec node --max-old-space-size=1536 /app/src/index.js';

/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test('Unit: _startNode sets joiner timeout env overrides', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      joiningHttpTimeoutMs: 45000,
      joiningLeadershipWaitTimeoutMs: 180000,
    },
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-joiner-1',
      ip: '10.0.0.11',
      name: options.name,
    };
  };

  await cluster._startNode(
    'joiner-node-id',
    NODE_ROLES.JOINER,
    '10.0.0.2',
    0,
  );

  const env = capturedCreateOptions.env;
  assert.strictEqual(
    env[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS],
    '10.0.0.2:' + PORTS.REST,
    'joiner should receive seed address',
  );
  assert.strictEqual(
    env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
    '45000',
    'joiner should receive overridden HTTP timeout',
  );
  assert.strictEqual(
    env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
    '180000',
    'joiner should receive overridden leadership wait timeout',
  );
});

test('Unit: _startNode injects benchmark control timeout into NodeHandle',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      benchmark: {
        controlQueryTimeoutMs: 4321,
      },
    });

    cluster._networkName = 'test-net';

    const provider = cluster._providers[0];
    provider.createContainer = async (options) => ({
      containerId: 'container-1',
      ip: '10.0.0.10',
      name: options.name,
    });

    const node = await cluster._startNode('test-node-id', NODE_ROLES.SEED, null, 0);

    assert.strictEqual(
      node._defaultAdminQueryTimeoutMs,
      4321,
      'NodeHandle should inherit the benchmark control timeout configured for the cluster',
    );
  });

test('Unit: _startNode sets leak capture NODE_OPTIONS when enabled', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    memoryLeak: {
      enabled: true,
      captureHeapArtifacts: true,
      heapSnapshotNearLimitCount: 4,
    },
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-2',
      ip: '10.0.0.20',
      name: options.name,
    };
  };

  await cluster._startNode('node-with-leak-capture', NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.ok(env.NODE_OPTIONS, 'NODE_OPTIONS should be set');
  assert.ok(
    env.NODE_OPTIONS.includes('--heap-prof'),
    'NODE_OPTIONS should enable heap profiling',
  );
  assert.ok(
    env.NODE_OPTIONS.includes('--heapsnapshot-near-heap-limit=4'),
    'NODE_OPTIONS should use configured near-limit snapshot count',
  );
});

test('Unit: _startNode forwards docker bind mounts as hostConfig extras', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {
      socketPath: '/var/run/docker.sock',
      binds: ['/tmp/project/src:/app/src:ro'],
    },
    image: 'distributed-db:test',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-bind-test',
      ip: '10.0.0.25',
      name: options.name,
    };
  };

  await cluster._startNode('bind-node', NODE_ROLES.SEED, null, 0);

  assert.deepStrictEqual(
    capturedCreateOptions.hostConfigExtras,
    {Binds: ['/tmp/project/src:/app/src:ro']},
    'bind mounts should be forwarded into host config extras',
  );
});

test('Unit: _startNode reuses existing local container when reuse is enabled', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
      keepRunningContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._networkName = 'ddb-test-net-reuse-local-1';
  cluster._networkId = 'net-reuse-1';

  // _buildNodeId now returns a deterministic UUID for reuse mode
  const reuseNodeId = cluster._buildNodeId(0);

  const provider = cluster._providers[0];
  let inspectedContainerName = null;
  const stopContainerCalls = [];
  let startContainerCalls = 0;
  let createContainerCalls = 0;
  provider.inspectContainerIfExists = async (name) => {
    inspectedContainerName = name;
    return {
      Id: 'existing-container-id',
      State: {Status: 'running'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-1-1:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: [REUSE_START_COMMAND],
      },
      NetworkSettings: {
        Networks: {
          [cluster._networkName]: {
            IPAddress: '10.0.0.44',
          },
        },
      },
    };
  };
  provider.stopContainer = async (containerId) => {
    stopContainerCalls.push(containerId);
  };
  provider.startContainer = async () => {
    startContainerCalls++;
  };
  provider.inspectContainer = async () => ({
    NetworkSettings: {
      Networks: {
        [cluster._networkName]: {
          IPAddress: '10.0.0.44',
          Aliases: ['ddb-test-reuse-1-1'],
        },
      },
    },
  });
  provider.createContainer = async () => {
    createContainerCalls++;
    throw new Error('createContainer should not be called for reused node');
  };
  let connectToNetworkArgs = null;
  provider.connectToNetwork = async (networkId, containerId, aliases) => {
    connectToNetworkArgs = {networkId, containerId, aliases};
  };

  const node = await cluster._startNode(
    reuseNodeId,
    NODE_ROLES.SEED,
    null,
    0,
  );

  assert.strictEqual(
    inspectedContainerName,
    'ddb-test-reuse-1-1',
    'reuse mode should use deterministic container naming',
  );
  assert.strictEqual(
    stopContainerCalls.length,
    1,
    'running reusable container should be quiesced before start',
  );
  assert.strictEqual(
    stopContainerCalls[0],
    'existing-container-id',
    'running reusable container should be stopped explicitly',
  );
  assert.strictEqual(startContainerCalls, 1);
  assert.strictEqual(createContainerCalls, 0);
  assert.strictEqual(node.containerId, 'existing-container-id');
  assert.strictEqual(node.ip, '10.0.0.44');
  await assert.doesNotReject(
    fs.access(
      resolvePath(
        '.tmp',
        'reuse-control',
        'ddb-test-reuse-1-1',
        'reset-data-on-start',
      ),
    ),
    'reused containers should be marked for one-time data reset before scenario start',
  );
  assert.strictEqual(
    connectToNetworkArgs,
    null,
    'already-connected reusable containers should not be reconnected',
  );
});

test('Unit: _startNode recreates reusable joiner container on timeout env mismatch',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
      timeouts: {
        joiningHttpTimeoutMs: 45000,
        joiningLeadershipWaitTimeoutMs: 180000,
      },
    });

    cluster._networkName = 'ddb-test-net-reuse-local-2';
    cluster._networkId = 'net-reuse-2';

    const joinerId = cluster._buildNodeId(1);
    const provider = cluster._providers[0];
    let removeContainerId = null;
    let createContainerOptions = null;
    provider.inspectContainerIfExists = async () => ({
      Id: 'existing-joiner-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${joinerId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-2-2:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
          `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=10.0.0.1:8080`,
          `${ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS}=10000`,
          `${ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS}=30000`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: [REUSE_START_COMMAND],
      },
    });
    provider.removeContainer = async (containerId) => {
      removeContainerId = containerId;
    };
    provider.createContainer = async (options) => {
      createContainerOptions = options;
      return {
        containerId: 'new-joiner-container-id',
        ip: '10.0.0.52',
        name: options.name,
      };
    };

    const node = await cluster._startNode(
      joinerId,
      NODE_ROLES.JOINER,
      '10.0.0.1',
      1,
    );

    assert.strictEqual(
      removeContainerId,
      'existing-joiner-container-id',
      'mismatched reusable joiner env should force container recreation',
    );
    assert.ok(
      createContainerOptions,
      'recreated reusable joiner should be created with updated env',
    );
    assert.ok(
      createContainerOptions.hostConfigExtras?.Binds?.some((entry) =>
        String(entry).endsWith(
          ':/harness-control',
        ),
      ),
      'recreated reusable joiner should mount the reuse-control bind',
    );
    assert.strictEqual(
      createContainerOptions.env[ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS],
      '45000',
    );
    assert.strictEqual(
      createContainerOptions.env[ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS],
      '180000',
    );
    assert.strictEqual(node.containerId, 'new-joiner-container-id');
    assert.strictEqual(node.ip, '10.0.0.52');
  });

test('Unit: Cluster.start quiesces reusable containers before startup sequence',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
        keepRunningContainers: true,
      },
      image: 'distributed-db:test',
    });

    const provider = {
      ensureNetwork: async () => ({id: 'net-reuse-3', name: 'net-reuse-3'}),
      removeNetwork: async () => {},
    };
    cluster._providers = [provider];
    cluster._hostAssignment = [0, 0];
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};
    cluster._waitForBootstrapApi = async () => {};
    cluster._waitForAllActive = async () => {};

    const containerStateByName = new Map();
    const containerIpByName = new Map();
    const seedNodeId = cluster._buildNodeId(0);
    const joinerNodeId = cluster._buildNodeId(1);
    const seedContainerName = 'ddb-test-reuse-2-1';
    const joinerContainerName = 'ddb-test-reuse-2-2';
    const strayContainerName = 'ddb-test-reuse-2-3';
    const seedContainerId = 'reuse-container-seed';
    const joinerContainerId = 'reuse-container-joiner';
    const strayContainerId = 'reuse-container-stray';
    containerStateByName.set(seedContainerName, 'running');
    containerStateByName.set(joinerContainerName, 'running');
    containerStateByName.set(strayContainerName, 'running');
    containerIpByName.set(seedContainerName, '10.0.2.1');
    containerIpByName.set(joinerContainerName, '10.0.2.2');
    containerIpByName.set(strayContainerName, '10.0.2.3');
    const stoppedContainers = [];

    provider.listContainers = async () => [
      {Names: [`/${seedContainerName}`]},
      {Names: [`/${joinerContainerName}`]},
      {Names: [`/${strayContainerName}`]},
    ];
    provider.inspectContainerIfExists = async (name) => {
      if (!containerStateByName.has(name)) {
        return null;
      }
      const env = [
        `NODE_ID=${
          name === seedContainerName ?
            seedNodeId :
            name === joinerContainerName ?
              joinerNodeId :
              cluster._buildNodeId(2)
        }`,
        'DATA_DIR=/data',
        `NODE_ADDRESS=${name}:8080`,
        'TRANSPORT_WS_HOST=0.0.0.0',
        `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
      ];
      if (name === joinerContainerName) {
        env.push(
          `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=10.0.2.1:8080`,
          `${ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS}=30000`,
          `${ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS}=120000`,
        );
      }
      return {
        Id: name === seedContainerName ?
          seedContainerId :
          name === joinerContainerName ?
            joinerContainerId :
            strayContainerId,
        State: {Status: containerStateByName.get(name)},
        Config: {
          Env: env,
          Entrypoint: ['sh', '-lc'],
          Cmd: [REUSE_START_COMMAND],
        },
        NetworkSettings: {
          Networks: {
            'ddb-test-net-reuse-local-2': {
              IPAddress: containerIpByName.get(name),
              Aliases: [name],
            },
          },
        },
      };
    };
    provider.stopContainer = async (containerId) => {
      stoppedContainers.push(containerId);
      if (containerId === seedContainerId) {
        containerStateByName.set(seedContainerName, 'exited');
      } else if (containerId === joinerContainerId) {
        containerStateByName.set(joinerContainerName, 'exited');
      } else if (containerId === strayContainerId) {
        containerStateByName.set(strayContainerName, 'exited');
      }
    };
    provider.startContainer = async (containerId) => {
      if (containerId === seedContainerId) {
        containerStateByName.set(seedContainerName, 'running');
      } else if (containerId === joinerContainerId) {
        containerStateByName.set(joinerContainerName, 'running');
      } else if (containerId === strayContainerId) {
        containerStateByName.set(strayContainerName, 'running');
      }
    };
    provider.restartContainer = async () => {
      throw new Error('start() should quiesce before startup, not restart');
    };
    provider.inspectContainer = async (containerId) => {
      const name = containerId === seedContainerId ?
        seedContainerName :
        containerId === joinerContainerId ?
          joinerContainerName :
          strayContainerName;
      return {
        NetworkSettings: {
          Networks: {
            [cluster._networkName]: {
              IPAddress: containerIpByName.get(name),
              Aliases: [name],
            },
          },
        },
      };
    };
    provider.connectToNetwork = async () => {};
    provider.createContainer = async () => {
      throw new Error('reusable containers should be reused in this test');
    };

    await cluster.start();

    assert.deepStrictEqual(
      stoppedContainers,
      [seedContainerId, joinerContainerId, strayContainerId],
      'reusable containers should quiesce base and stray same-size nodes',
    );

    await cluster.stop();
  });

test('Unit: reusable cluster lease rejects reentry in the same process',
  async () => {
    const lockPath = resolvePath(
      process.cwd(),
      '.tmp',
      'cluster-reuse-lease-reentry-' + Date.now() + '.lock',
    );
    const clusterA = createCluster({
      size: 5,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });
    const clusterB = createCluster({
      size: 5,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });

    clusterA._resolveReusableLeasePath = () => lockPath;
    clusterB._resolveReusableLeasePath = () => lockPath;

    try {
      await clusterA._acquireReusableClusterLease();
      await assert.rejects(
        () => clusterB._acquireReusableClusterLease(),
        /Reusable cluster lease already held in this process/,
      );
    } finally {
      await clusterA._releaseReusableClusterLease();
      await clusterB._releaseReusableClusterLease();
      await fs.rm(lockPath, {force: true});
    }
  });

test('Unit: reusable cluster lease recovers stale holder files', async () => {
  const lockPath = resolvePath(
    process.cwd(),
    '.tmp',
    'cluster-reuse-lease-stale-' + Date.now() + '.lock',
  );
  const cluster = createCluster({
    size: 5,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._resolveReusableLeasePath = () => lockPath;
  await fs.mkdir(resolvePath(process.cwd(), '.tmp'), {recursive: true});
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      pid: 999999,
      scenarioName: 'stale-owner',
      acquiredAtMs: Date.now() - 1000,
    }),
    'utf8',
  );

  try {
    await cluster._acquireReusableClusterLease();
    assert.strictEqual(
      typeof cluster._reuseLeaseRelease,
      'function',
      'stale reusable lease should be replaced by the current run',
    );
  } finally {
    await cluster._releaseReusableClusterLease();
    await fs.rm(lockPath, {force: true});
  }
});

test('Unit: reusable cluster lease timeout disables fast-local reuse for the ' +
  'current run', async () => {
  const cluster = createCluster({
    size: 5,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  cluster._acquireReusableClusterLease = async () => {
    const error = new Error(
      'Timed out waiting for reusable cluster lease ' +
      '(path=/tmp/reuse.lock, timeoutMs=1000, holderPid=42, ' +
      'holderScenario=busy-run)',
    );
    error.code = 'REUSE_CLUSTER_LEASE_TIMEOUT';
    throw error;
  };

  await cluster._prepareReusableClusterLeaseForStart();

  assert.strictEqual(
    cluster._isContainerReuseEnabled(),
    false,
    'lease timeout should disable reusable containers for this run',
  );
  assert.match(
    cluster._reuseLeaseFallbackWarning,
    /Timed out waiting for reusable cluster lease/,
    'lease timeout fallback should retain the cause for diagnostics',
  );
});

test('Unit: _startNode reconnects reusable container with hostname alias',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });

    cluster._networkName = 'ddb-test-net-reuse-local-1';
    cluster._networkId = 'net-reuse-1';

    const reuseNodeId = cluster._buildNodeId(0);
    const provider = cluster._providers[0];
    let connectToNetworkArgs = null;
    let inspectAfterStartCalls = 0;
    provider.inspectContainerIfExists = async () => ({
      Id: 'existing-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-1-1:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: [REUSE_START_COMMAND],
      },
      NetworkSettings: {
        Networks: {
          [cluster._networkName]: {
            IPAddress: '10.0.0.55',
            Aliases: [],
          },
        },
      },
    });
    provider.startContainer = async () => {};
    provider.disconnectFromNetwork = async () => {};
    provider.inspectContainer = async () => {
      inspectAfterStartCalls++;
      return {
        NetworkSettings: {
          Networks: inspectAfterStartCalls === 1 ?
            {
              [cluster._networkName]: {
                IPAddress: '10.0.0.55',
                Aliases: [],
              },
            } :
            {
              [cluster._networkName]: {
                IPAddress: '10.0.0.55',
                Aliases: ['ddb-test-reuse-1-1'],
              },
            },
        },
      };
    };
    provider.connectToNetwork = async (networkId, containerId, aliases) => {
      connectToNetworkArgs = {networkId, containerId, aliases};
    };
    provider.createContainer = async () => {
      throw new Error('createContainer should not be called for reused node');
    };

    const node = await cluster._startNode(
      reuseNodeId,
      NODE_ROLES.SEED,
      null,
      0,
    );

    assert.deepStrictEqual(
      connectToNetworkArgs,
      {
        networkId: 'net-reuse-1',
        containerId: 'existing-container-id',
        aliases: ['ddb-test-reuse-1-1'],
      },
      'reused containers should be reattached when run-network endpoint ' +
      'is missing the hostname alias used in node addresses',
    );
    assert.strictEqual(node.containerId, 'existing-container-id');
    assert.strictEqual(node.ip, '10.0.0.55');
  });

test('Unit: _startNode propagates configured raft provider env', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    raftProvider: 'raft_logic',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-raft-provider',
      ip: '10.0.0.30',
      name: options.name,
    };
  };

  await cluster._startNode('provider-node', NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.strictEqual(
    env[RAFT_PROVIDER_DEFAULTS.envKey],
    'raft_logic',
    'configured raft provider should be passed to node container',
  );
});

/**
 * Unit: startup failure error reporting with logs (Req 3.4)
 */
test('Unit: _startNode failure produces descriptive error', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {nodeStartup: 50},
  });

  const provider = cluster._providers[0];
  provider.createContainer = async () => {
    throw new Error('image not found');
  };

  // Prevent real Docker log collection
  cluster._collectFailureLogs = async () => {};

  await assert.rejects(
    () => cluster._startNode(
      'test-node-1', NODE_ROLES.SEED, null, 0,
    ),
    (err) => {
      assert.ok(
        err.message.includes('test-node-1'),
        'error should include node ID: ' + err.message,
      );
      assert.ok(
        err.message.includes('failed to start'),
        'error should mention startup failure: ' + err.message,
      );
      assert.ok(
        err.message.includes('image not found'),
        'error should include original cause: ' + err.message,
      );
      assert.ok(
        err.message.includes(NODE_ROLES.SEED),
        'error should include node role: ' + err.message,
      );
      return true;
    },
  );
});

test('Unit: _collectFailureLogs collects from all nodes', async () => {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const logsCalled = [];
  const mockProvider = {
    getContainerLogs: async (containerId, _opts) => {
      logsCalled.push(containerId);
      return 'mock log output for ' + containerId;
    },
  };

  cluster._nodes.set('n1', new NodeHandle(
    'n1', 'container-aaa', '10.0.0.1', NODE_ROLES.SEED,
    mockProvider,
  ));
  cluster._nodes.set('n2', new NodeHandle(
    'n2', 'container-bbb', '10.0.0.2', NODE_ROLES.JOINER,
    mockProvider,
  ));

  // _collectFailureLogs writes to stderr; just verify it
  // calls getLogs on each node without throwing
  await cluster._collectFailureLogs();

  assert.strictEqual(
    logsCalled.length,
    2,
    'should collect logs from both nodes',
  );
  assert.ok(
    logsCalled.includes('container-aaa'),
    'should collect logs from first node container',
  );
  assert.ok(
    logsCalled.includes('container-bbb'),
    'should collect logs from second node container',
  );
});

/**
 * Unit: best-effort cleanup via labels (Req 2.6)
 */
test('Unit: createCluster registers process cleanup handlers only once', async () => {
  const firstCluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const countsAfterFirst = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    uncaughtException: process.listenerCount('uncaughtException'),
  };

  const secondCluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const countsAfterSecond = {
    exit: process.listenerCount('exit'),
    SIGINT: process.listenerCount('SIGINT'),
    SIGTERM: process.listenerCount('SIGTERM'),
    uncaughtException: process.listenerCount('uncaughtException'),
  };

  assert.deepStrictEqual(
    countsAfterSecond,
    countsAfterFirst,
    'listener counts should remain stable across repeated createCluster calls',
  );
  assert.ok(
    countsAfterFirst.exit >= 1,
    'should have at least one exit listener registered',
  );
  assert.ok(
    countsAfterFirst.SIGINT >= 1,
    'should have at least one SIGINT listener registered',
  );
  assert.ok(
    countsAfterFirst.SIGTERM >= 1,
    'should have at least one SIGTERM listener registered',
  );
  assert.ok(
    countsAfterFirst.uncaughtException >= 1,
    'should have at least one uncaughtException listener registered',
  );
  assert.ok(
    firstCluster._clusterId,
    'cluster should have a clusterId for label identification',
  );
  assert.ok(
    secondCluster._clusterId,
    'second cluster should have a clusterId for label identification',
  );
});

test('Unit: cluster uses label constants for identification', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  assert.ok(
    typeof cluster._clusterId === 'string',
    'clusterId should be a string',
  );
  assert.ok(
    cluster._clusterId.length > 0,
    'clusterId should not be empty',
  );

  assert.ok(
    LABELS.CLUSTER,
    'LABELS.CLUSTER constant should exist for cleanup identification',
  );
});

test('Unit: _buildNodeId returns valid UUIDs in reuse mode', async () => {
  // Bug: _buildNodeId in reuse mode returns 'reuse-node-1' etc. which are
  // not valid UUIDs. The bootstrap API requires UUID node IDs, causing
  // joining nodes to fail with "nodeId must be a valid UUID".
  const cluster = createCluster({
    size: 3,
    docker: {
      socketPath: '/var/run/docker.sock',
      reuseContainers: true,
    },
    image: 'distributed-db:test',
  });

  assert.ok(
    cluster._isContainerReuseEnabled(),
    'reuse mode should be enabled for this config',
  );

  const nodeId0 = cluster._buildNodeId(0);
  const nodeId1 = cluster._buildNodeId(1);
  const nodeId2 = cluster._buildNodeId(2);

  assert.ok(
    uuidValidate(nodeId0),
    'reuse-mode node ID for index 0 must be a valid UUID, got: ' + nodeId0,
  );
  assert.ok(
    uuidValidate(nodeId1),
    'reuse-mode node ID for index 1 must be a valid UUID, got: ' + nodeId1,
  );
  assert.ok(
    uuidValidate(nodeId2),
    'reuse-mode node ID for index 2 must be a valid UUID, got: ' + nodeId2,
  );

  // IDs must be distinct
  assert.notStrictEqual(nodeId0, nodeId1);
  assert.notStrictEqual(nodeId1, nodeId2);
  assert.notStrictEqual(nodeId0, nodeId2);

  // IDs must be deterministic (same index → same UUID across calls)
  assert.strictEqual(cluster._buildNodeId(0), nodeId0);
  assert.strictEqual(cluster._buildNodeId(1), nodeId1);
  assert.strictEqual(cluster._buildNodeId(2), nodeId2);
});
