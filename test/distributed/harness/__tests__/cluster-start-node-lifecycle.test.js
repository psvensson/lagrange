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
  REQUEST_CELL_AUTH,
} from './cluster-test-helpers.js';

const REQUEST_CELL_AUTH_ENV_LINES = Object.freeze([
  `PGWIRE_AUTH_USER=${REQUEST_CELL_AUTH.USER}`,
  `PGWIRE_AUTH_PASSWORD=${REQUEST_CELL_AUTH.PASSWORD}`,
  `PGWIRE_AUTH_DATABASE=${REQUEST_CELL_AUTH.DATABASE}`,
]);

const REUSE_IMAGE_ENTRYPOINT = Object.freeze(['/nodejs/bin/node']);
const REUSE_IMAGE_CMD = Object.freeze([
  '--max-old-space-size=1536',
  'src/index.js',
]);
const REUSE_CONTAINER_ABI_VERSION = 'shell-free-host-data-v1';
const LEGACY_REUSE_START_COMMAND =
  'if [ -f /harness-control/reset-data-on-start ]; then rm -rf /data/* && ' +
  'rm -f /harness-control/reset-data-on-start; fi; ' +
  'exec node --max-old-space-size=1536 /app/src/index.js';
const REUSE_INSPECT_FAILURE_MESSAGE =
  'reusable container inspect unavailable';

function buildReuseDataDir(containerName) {
  return resolvePath('.tmp', 'reuse-data', containerName);
}

function buildReuseDataBind(containerName) {
  return buildReuseDataDir(containerName) + ':/data';
}

function buildReuseLabels() {
  return {
    [LABELS.REUSE_ABI]: REUSE_CONTAINER_ABI_VERSION,
  };
}

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
test('Unit: host-network mode allocates per-node ports and host IPs', async () => {
  const hostInfo = [
    {externalIp: '34.1.1.1', internalIp: '10.128.0.1'},
    {externalIp: '34.2.2.2', internalIp: '10.128.0.2'},
  ];
  const cluster = createCluster({
    size: 2,
    nodesPerHost: 1,
    image: 'distributed-db:test',
    docker: {
      hosts: ['tcp://34.1.1.1:2376', 'tcp://34.2.2.2:2376'],
      hostInfo,
    },
  });

  assert.strictEqual(cluster._hostNetworkMode, true, 'multi-host -> host mode');

  // Node 0 on host 0, node 1 on host 1 (nodesPerHost=1).
  const env0 = cluster._buildNodeEnv('n0', 'c0', null, 0);
  const env1 = cluster._buildNodeEnv('n1', 'c1', '10.128.0.1', 1);

  // Per-node port block: node i uses base + i*PORT_BLOCK.
  assert.strictEqual(env0.REST_API_PORT, String(PORTS.REST));
  assert.strictEqual(env1.REST_API_PORT, String(PORTS.REST + 10));
  assert.strictEqual(env0.ADMIN_WS_PORT, String(PORTS.ADMIN_API));
  assert.strictEqual(env1.ADMIN_WS_PORT, String(PORTS.ADMIN_API + 10));

  // Advertise on the host's VPC-internal IP so cross-VM peers can reach it.
  assert.strictEqual(
    env0[CONTAINER_ENV_KEYS.NODE_ADDRESS],
    '10.128.0.1:' + PORTS.REST,
  );
  assert.strictEqual(
    env1[CONTAINER_ENV_KEYS.NODE_ADDRESS],
    '10.128.0.2:' + (PORTS.REST + 10),
  );

  // Joiner reaches the seed at the seed host internal IP + seed's REST port.
  assert.strictEqual(
    env1[CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS],
    '10.128.0.1:' + PORTS.REST,
  );
});

test('Unit: single-host keeps bridge mode (no host-network env)', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  assert.strictEqual(cluster._hostNetworkMode, false);
  const env = cluster._buildNodeEnv('n0', 'container-abc', null, 0);
  // Bridge mode advertises the container DNS alias at the standard port and
  // sets no per-node port overrides.
  assert.strictEqual(
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS],
    'container-abc:' + PORTS.REST,
  );
  assert.strictEqual(env.REST_API_PORT, undefined);
  assert.strictEqual(env.ADMIN_WS_PORT, undefined);
});

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
  const reuseContainerName = 'ddb-test-reuse-1-1';
  const reuseDataDir = buildReuseDataDir(reuseContainerName);
  const staleDataFile = resolvePath(reuseDataDir, 'stale.db');
  await fs.rm(reuseDataDir, {recursive: true, force: true});
  await fs.mkdir(reuseDataDir, {recursive: true});
  await fs.writeFile(staleDataFile, 'stale', 'utf8');

  const provider = cluster._providers[0];
  provider.inspectImage = async () => null;
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
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Labels: buildReuseLabels(),
        Entrypoint: REUSE_IMAGE_ENTRYPOINT,
        Cmd: REUSE_IMAGE_CMD,
      },
      HostConfig: {
        Binds: [buildReuseDataBind(reuseContainerName)],
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
    reuseContainerName,
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
    fs.access(reuseDataDir),
    'reused containers should keep a host-managed data directory',
  );
  await assert.rejects(
    fs.access(staleDataFile),
    'reused containers should be reset by clearing the host data directory',
  );
  assert.strictEqual(
    connectToNetworkArgs,
    null,
    'already-connected reusable containers should not be reconnected',
  );
});

test('Unit: _startNode propagates reusable container inspect failures',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {
        socketPath: '/var/run/docker.sock',
        reuseContainers: true,
      },
      image: 'distributed-db:test',
    });
    cluster._networkName = 'ddb-test-net-reuse-inspect-failure';
    cluster._networkId = 'net-reuse-inspect-failure';

    const provider = cluster._providers[0];
    const inspectFailure = new Error(REUSE_INSPECT_FAILURE_MESSAGE);
    provider.inspectImage = async () => null;
    provider.inspectContainerIfExists = async () => {
      throw inspectFailure;
    };

    await assert.rejects(
      cluster._startNode(
        cluster._buildNodeId(0),
        NODE_ROLES.SEED,
        null,
        0,
      ),
      (error) => error === inspectFailure,
    );
  });

test('Unit: _startNode recreates legacy shell reusable container',
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
    const reuseContainerName = 'ddb-test-reuse-1-1';
    const provider = cluster._providers[0];
    let removeContainerId = null;
    let createContainerOptions = null;
    provider.inspectContainerIfExists = async () => ({
      Id: 'legacy-shell-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          `NODE_ADDRESS=${reuseContainerName}:8080`,
          'TRANSPORT_WS_HOST=0.0.0.0',
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Labels: buildReuseLabels(),
        Entrypoint: ['sh', '-lc'],
        Cmd: [LEGACY_REUSE_START_COMMAND],
      },
      HostConfig: {
        Binds: [buildReuseDataBind(reuseContainerName)],
      },
    });
    provider.removeContainer = async (containerId) => {
      removeContainerId = containerId;
    };
    provider.createContainer = async (options) => {
      createContainerOptions = options;
      return {
        containerId: 'new-shell-free-container-id',
        ip: '10.0.0.61',
        name: options.name,
      };
    };

    const node = await cluster._startNode(
      reuseNodeId,
      NODE_ROLES.SEED,
      null,
      0,
    );

    assert.strictEqual(
      removeContainerId,
      'legacy-shell-container-id',
      'legacy reusable container with shell launch should be recreated',
    );
    assert.ok(createContainerOptions);
    assert.strictEqual(
      createContainerOptions.labels[LABELS.REUSE_ABI],
      REUSE_CONTAINER_ABI_VERSION,
    );
    assert.strictEqual(createContainerOptions.entrypoint, undefined);
    assert.strictEqual(createContainerOptions.command, undefined);
    assert.strictEqual(node.containerId, 'new-shell-free-container-id');
  });

test('Unit: _startNode recreates reusable container on data bind mismatch',
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
    let removeContainerId = null;
    let createContainerOptions = null;
    provider.inspectContainerIfExists = async () => ({
      Id: 'wrong-data-bind-container-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          'NODE_ADDRESS=ddb-test-reuse-1-1:8080',
          'TRANSPORT_WS_HOST=0.0.0.0',
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Labels: buildReuseLabels(),
        Entrypoint: REUSE_IMAGE_ENTRYPOINT,
        Cmd: REUSE_IMAGE_CMD,
      },
      HostConfig: {
        Binds: ['/tmp/old-reuse-data:/data'],
      },
    });
    provider.removeContainer = async (containerId) => {
      removeContainerId = containerId;
    };
    provider.createContainer = async (options) => {
      createContainerOptions = options;
      return {
        containerId: 'new-data-bind-container-id',
        ip: '10.0.0.62',
        name: options.name,
      };
    };

    const node = await cluster._startNode(
      reuseNodeId,
      NODE_ROLES.SEED,
      null,
      0,
    );

    assert.strictEqual(removeContainerId, 'wrong-data-bind-container-id');
    assert.ok(
      createContainerOptions.hostConfigExtras?.Binds?.includes(
        buildReuseDataBind('ddb-test-reuse-1-1'),
      ),
      'recreated reusable container should mount the expected data bind',
    );
    assert.strictEqual(node.containerId, 'new-data-bind-container-id');
  });

test('Unit: _startNode recreates reusable container on image identity mismatch',
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
    const reuseContainerName = 'ddb-test-reuse-1-1';
    const provider = cluster._providers[0];
    let removeContainerId = null;
    let createContainerOptions = null;
    provider.inspectImage = async () => ({Id: 'current-image-id'});
    provider.inspectContainerIfExists = async () => ({
      Id: 'old-image-container-id',
      Image: 'old-image-id',
      State: {Status: 'exited'},
      Config: {
        Env: [
          `NODE_ID=${reuseNodeId}`,
          'DATA_DIR=/data',
          `NODE_ADDRESS=${reuseContainerName}:8080`,
          'TRANSPORT_WS_HOST=0.0.0.0',
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Labels: buildReuseLabels(),
        Entrypoint: REUSE_IMAGE_ENTRYPOINT,
        Cmd: REUSE_IMAGE_CMD,
      },
      HostConfig: {
        Binds: [buildReuseDataBind(reuseContainerName)],
      },
    });
    provider.removeContainer = async (containerId) => {
      removeContainerId = containerId;
    };
    provider.createContainer = async (options) => {
      createContainerOptions = options;
      return {
        containerId: 'new-image-container-id',
        ip: '10.0.0.63',
        name: options.name,
      };
    };

    const node = await cluster._startNode(
      reuseNodeId,
      NODE_ROLES.SEED,
      null,
      0,
    );

    assert.strictEqual(removeContainerId, 'old-image-container-id');
    assert.strictEqual(
      createContainerOptions.labels[LABELS.REUSE_ABI],
      REUSE_CONTAINER_ABI_VERSION,
    );
    assert.strictEqual(node.containerId, 'new-image-container-id');
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
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
          `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=10.0.0.1:8080`,
          `${ENTRYPOINT_ENV.JOINING_HTTP_TIMEOUT_MS}=10000`,
          `${ENTRYPOINT_ENV.JOINING_LEADERSHIP_WAIT_TIMEOUT_MS}=30000`,
        ],
        Entrypoint: ['sh', '-lc'],
        Cmd: [LEGACY_REUSE_START_COMMAND],
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
          ':/data',
        ),
      ),
      'recreated reusable joiner should mount the host-managed data bind',
    );
    assert.strictEqual(
      createContainerOptions.entrypoint,
      undefined,
      'recreated reusable joiner should use the image entrypoint',
    );
    assert.strictEqual(
      createContainerOptions.command,
      undefined,
      'recreated reusable joiner should use the image CMD',
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
        'ADMIN_WS_HOST=0.0.0.0',
        'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
        ...REQUEST_CELL_AUTH_ENV_LINES,
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
          Labels: buildReuseLabels(),
          Entrypoint: REUSE_IMAGE_ENTRYPOINT,
          Cmd: REUSE_IMAGE_CMD,
        },
        HostConfig: {
          Binds: [buildReuseDataBind(name)],
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

test('Unit: Cluster.stop tears down nodes after playback shutdown failure',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const stopCalls = [];
    const removeCalls = [];
    const mockProvider = {
      stopContainer: async (containerId) => {
        stopCalls.push(containerId);
      },
      removeContainer: async (containerId) => {
        removeCalls.push(containerId);
      },
    };
    const node = {
      id: 'n1',
      role: NODE_ROLES.SEED,
      containerId: 'container-teardown-1',
      _dockerProvider: mockProvider,
      closeQueryConnection: () => {},
    };
    cluster._nodes.set(node.id, node);
    cluster._providers = [mockProvider];
    cluster._hostAssignment = [0];
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};
    cluster._playbackRecorder = {
      beginShutdown: async () => {
        throw new Error('simulated playback shutdown failure');
      },
      stop: async () => null,
      recordEvent: () => {},
    };

    const originalStderrWrite = process.stderr.write;
    let warningOutput = '';
    process.stderr.write = (chunk, encoding, callback) => {
      warningOutput += String(chunk);
      if (typeof encoding === 'function') {
        encoding();
      }
      if (typeof callback === 'function') {
        callback();
      }
      return true;
    };

    try {
      await cluster.stop();
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    assert.deepStrictEqual(
      stopCalls,
      ['container-teardown-1'],
      'node container should still stop after playback shutdown failure',
    );
    assert.deepStrictEqual(
      removeCalls,
      ['container-teardown-1'],
      'non-reusable node container should still be removed after stop',
    );
    assert.ok(
      warningOutput.includes('Failed to begin playback shutdown'),
      'teardown should keep the playback failure as a warning',
    );
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
      // Above kernel.pid_max (<= 4194304 on Linux), so no live process can
      // ever hold it; 999999 was a REAL pid under test-runner process churn
      // and made stale-recovery see a live holder.
      pid: 2147483647,
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
    const reuseContainerName = 'ddb-test-reuse-1-1';
    const provider = cluster._providers[0];
    provider.inspectImage = async () => null;
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
          'ADMIN_WS_HOST=0.0.0.0',
          'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true',
          ...REQUEST_CELL_AUTH_ENV_LINES,
          `${RAFT_PROVIDER_DEFAULTS.envKey}=${RAFT_PROVIDER_DEFAULTS.provider}`,
        ],
        Labels: buildReuseLabels(),
        Entrypoint: REUSE_IMAGE_ENTRYPOINT,
        Cmd: REUSE_IMAGE_CMD,
      },
      HostConfig: {
        Binds: [buildReuseDataBind(reuseContainerName)],
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
