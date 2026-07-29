/**
 * Property-based tests for Docker Provider.
 *
 * Feature: distributed-testing-framework,
 * Property 2: Container Environment Configuration
 *
 * **Validates: Requirements 1.2, 3.2**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
  DockerProvider,
  parseContainerStats,
} from '../docker-provider.js';
import {CONTAINER_ENV_KEYS, PORTS} from '../constants.js';

const RESOURCE_SNAPSHOT_CONTAINER_ID = 'container-resource';
const RESOURCE_SNAPSHOT_STORAGE_PATH = '/data';
const RESOURCE_SNAPSHOT_STORAGE_COMMAND = Object.freeze([
  'du',
  '-sb',
  '--',
  RESOURCE_SNAPSHOT_STORAGE_PATH,
]);
const RESOURCE_SNAPSHOT_INVALID_OUTPUTS = Object.freeze([
  '\t/data\n',
  '4096',
  '4096\t/other\n',
  '4096\t/data\n8192\t/other\n',
]);

test('Property 2: Container Environment Configuration', async (t) => {
  await t.test(
    'for any node config, _buildEnvArray produces entries ' +
    'for all four required env vars with matching values',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      // Generate non-empty strings without '=' to avoid ambiguous parsing
      const safeString = fc.stringOf(
        fc.char().filter((c) => c !== '=' && c !== '\0'),
        {minLength: 1, maxLength: 50},
      );

      await fc.assert(
        fc.property(
          safeString,
          safeString,
          safeString,
          safeString,
          (nodeId, nodeAddress, seedAddress, dataDir) => {
            const env = {
              [CONTAINER_ENV_KEYS.NODE_ID]: nodeId,
              [CONTAINER_ENV_KEYS.NODE_ADDRESS]: nodeAddress,
              [CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS]: seedAddress,
              [CONTAINER_ENV_KEYS.DATA_DIR]: dataDir,
            };

            const envArray = provider._buildEnvArray(env);

            // All four required keys must be present
            const requiredKeys = [
              CONTAINER_ENV_KEYS.NODE_ID,
              CONTAINER_ENV_KEYS.NODE_ADDRESS,
              CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS,
              CONTAINER_ENV_KEYS.DATA_DIR,
            ];

            for (const key of requiredKeys) {
              const expected = `${key}=${env[key]}`;
              assert.ok(
                envArray.includes(expected),
                `Missing env entry: ${expected}`,
              );
            }

            // Array length matches input key count
            assert.strictEqual(envArray.length, Object.keys(env).length);
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'env array entries preserve exact key=value format ' +
    'for arbitrary additional env vars alongside required ones',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      const safeString = fc.stringOf(
        fc.char().filter((c) => c !== '=' && c !== '\0'),
        {minLength: 1, maxLength: 30},
      );

      await fc.assert(
        fc.property(
          safeString,
          safeString,
          safeString,
          safeString,
          fc.dictionary(
            fc.stringOf(
              fc.char().filter((c) =>
                c !== '=' && c !== '\0' && c.trim() === c),
              {minLength: 1, maxLength: 10},
            ),
            safeString,
            {minKeys: 0, maxKeys: 3},
          ),
          (nodeId, nodeAddress, seedAddress, dataDir, extras) => {
            const env = {
              [CONTAINER_ENV_KEYS.NODE_ID]: nodeId,
              [CONTAINER_ENV_KEYS.NODE_ADDRESS]: nodeAddress,
              [CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS]: seedAddress,
              [CONTAINER_ENV_KEYS.DATA_DIR]: dataDir,
              ...extras,
            };

            const envArray = provider._buildEnvArray(env);

            // Every entry in the array must be KEY=VALUE format
            for (const entry of envArray) {
              assert.ok(
                entry.includes('='),
                `Entry missing "=" separator: ${entry}`,
              );
            }

            // Required keys still present regardless of extras
            const requiredPairs = [
              `${CONTAINER_ENV_KEYS.NODE_ID}=${nodeId}`,
              `${CONTAINER_ENV_KEYS.NODE_ADDRESS}=${nodeAddress}`,
              `${CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS}=${seedAddress}`,
              `${CONTAINER_ENV_KEYS.DATA_DIR}=${dataDir}`,
            ];

            for (const pair of requiredPairs) {
              assert.ok(
                envArray.includes(pair),
                `Required env var missing: ${pair}`,
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );
});


// --- Unit Tests for Docker Provider ---

test('Unit: createContainer passes correct env vars to Docker', async (t) => {
  await t.test(
    'createContainer calls docker.createContainer with correct Env array',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedOpts = null;
      const fakeContainer = {
        id: 'fake-container-123',
        start: async () => {},
      };

      provider._docker.createContainer = async (opts) => {
        capturedOpts = opts;
        return fakeContainer;
      };
      provider._waitForRunning = async () => {};
      provider.inspectContainer = async () => ({
        NetworkSettings: {
          Networks: {'test-net': {IPAddress: '172.18.0.2'}},
        },
      });

      const env = {
        [CONTAINER_ENV_KEYS.NODE_ID]: 'node-1',
        [CONTAINER_ENV_KEYS.NODE_ADDRESS]: `172.18.0.2:${PORTS.WS_TRANSPORT}`,
        [CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS]: `172.18.0.1:${PORTS.WS_TRANSPORT}`,
        [CONTAINER_ENV_KEYS.DATA_DIR]: '/data/node-1',
      };

      await provider.createContainer({
        name: 'test-node-1',
        image: 'distributed-db:test',
        network: 'test-net',
        env,
      });

      assert.ok(capturedOpts, 'createContainer was called');
      assert.ok(Array.isArray(capturedOpts.Env), 'Env is an array');

      const expectedEntries = [
        'NODE_ID=node-1',
        `NODE_ADDRESS=172.18.0.2:${PORTS.WS_TRANSPORT}`,
        `SEED_NODE_ADDRESS=172.18.0.1:${PORTS.WS_TRANSPORT}`,
        'DATA_DIR=/data/node-1',
      ];
      for (const entry of expectedEntries) {
        assert.ok(
          capturedOpts.Env.includes(entry),
          `Env should contain "${entry}"`,
        );
      }
      assert.deepStrictEqual(
        capturedOpts.NetworkingConfig?.EndpointsConfig?.['test-net']?.Aliases,
        ['test-node-1'],
        'container create should publish a Docker network alias matching the container name',
      );
    },
  );
});

test('Unit: connectToNetwork forwards aliases when provided', async (t) => {
  await t.test(
    'connectToNetwork passes EndpointConfig aliases to Docker network connect',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
      let capturedConnectOptions = null;
      provider._docker.getNetwork = () => ({
        connect: async (options) => {
          capturedConnectOptions = options;
        },
      });

      await provider.connectToNetwork(
        'test-network-id',
        'test-container-id',
        ['ddb-test-reuse-5-4'],
      );

      assert.deepStrictEqual(
        capturedConnectOptions,
        {
          Container: 'test-container-id',
          EndpointConfig: {
            Aliases: ['ddb-test-reuse-5-4'],
          },
        },
        'network connect should preserve explicit aliases',
      );
    },
  );
});

test('Unit: createContainer forwards optional command and entrypoint', async (t) => {
  await t.test(
    'createContainer passes Cmd and Entrypoint when provided',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedOpts = null;
      const fakeContainer = {
        id: 'fake-container-cmd-123',
        start: async () => {},
      };

      provider._docker.createContainer = async (opts) => {
        capturedOpts = opts;
        return fakeContainer;
      };
      provider._waitForRunning = async () => {};
      provider.inspectContainer = async () => ({
        NetworkSettings: {
          Networks: {'test-net': {IPAddress: '172.18.0.3'}},
        },
      });

      await provider.createContainer({
        name: 'test-node-cmd',
        image: 'postgres:16',
        network: 'test-net',
        command: ['sh', '-lc', 'echo hello'],
        entrypoint: ['docker-entrypoint.sh'],
      });

      assert.ok(capturedOpts, 'createContainer was called');
      assert.deepStrictEqual(
        capturedOpts.Cmd,
        ['sh', '-lc', 'echo hello'],
        'Cmd should be passed through',
      );
      assert.deepStrictEqual(
        capturedOpts.Entrypoint,
        ['docker-entrypoint.sh'],
        'Entrypoint should be passed through',
      );
    },
  );
});

test('Unit: createContainer forwards hostConfig extras', async (t) => {
  await t.test(
    'createContainer includes custom host config fields like Binds',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedOpts = null;
      const fakeContainer = {
        id: 'fake-container-bind-123',
        start: async () => {},
      };

      provider._docker.createContainer = async (opts) => {
        capturedOpts = opts;
        return fakeContainer;
      };
      provider._waitForRunning = async () => {};
      provider.inspectContainer = async () => ({
        NetworkSettings: {
          Networks: {'test-net': {IPAddress: '172.18.0.4'}},
        },
      });

      await provider.createContainer({
        name: 'test-node-bind',
        image: 'distributed-db:test',
        network: 'test-net',
        hostConfigExtras: {
          Binds: ['/tmp/project/src:/app/src:ro'],
        },
      });

      assert.ok(capturedOpts, 'createContainer was called');
      assert.ok(capturedOpts.HostConfig, 'HostConfig should be present');
      assert.deepStrictEqual(
        capturedOpts.HostConfig.Binds,
        ['/tmp/project/src:/app/src:ro'],
        'bind mounts should be forwarded into HostConfig',
      );
    },
  );
});

test('Unit: container start timeout error and cleanup', async (t) => {
  await t.test(
    'throws error and cleans up when container never reaches running state',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      const fakeContainer = {
        id: 'timeout-container-456',
        start: async () => {},
      };

      provider._docker.createContainer = async () => fakeContainer;

      // inspectContainer always returns non-running state
      provider.inspectContainer = async () => ({
        State: {Status: 'created'},
      });

      // Mock _sleep to resolve immediately so we don't wait real time
      provider._sleep = async () => {};

      let cleanupCalled = false;
      let cleanupId = null;
      provider._cleanupFailedContainer = async (containerId) => {
        cleanupCalled = true;
        cleanupId = containerId;
      };

      await assert.rejects(
        () => provider.createContainer({
          name: 'timeout-node',
          image: 'distributed-db:test',
          network: 'test-net',
          startTimeout: 50,
        }),
        (err) => {
          assert.ok(
            err.message.includes('failed to start'),
            `Error message should mention failure: ${err.message}`,
          );
          assert.ok(
            err.message.includes('timeout-node'),
            `Error message should include container name: ${err.message}`,
          );
          return true;
        },
      );

      assert.ok(cleanupCalled, 'cleanup was called for the failed container');
      assert.strictEqual(
        cleanupId,
        'timeout-container-456',
        'cleanup received the correct container ID',
      );
    },
  );
});

test('Unit: removeContainer calls remove with force and volumes', async (t) => {
  await t.test(
    'removeContainer passes force:true and v:true options',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedRemoveOpts = null;
      let getContainerCalledWith = null;

      provider._docker.getContainer = (containerId) => {
        getContainerCalledWith = containerId;
        return {
          remove: async (opts) => {
            capturedRemoveOpts = opts;
          },
        };
      };

      await provider.removeContainer('container-to-remove');

      assert.strictEqual(
        getContainerCalledWith,
        'container-to-remove',
        'getContainer called with correct ID',
      );
      assert.ok(capturedRemoveOpts, 'remove was called');
      assert.strictEqual(
        capturedRemoveOpts.force,
        true,
        'force option should be true',
      );
      assert.strictEqual(
        capturedRemoveOpts.v,
        true,
        'v (volumes) option should be true',
      );
    },
  );
});

test('Unit: ensureNetwork reuses existing network on already-exists error', async (t) => {
  await t.test(
    'ensureNetwork returns existing network id when createNetwork conflicts',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      provider._docker.createNetwork = async () => {
        throw new Error('network with name ddb-reuse already exists');
      };
      provider._docker.listNetworks = async () => ([
        {
          Id: 'existing-network-id',
          Name: 'ddb-reuse',
        },
      ]);

      const network = await provider.ensureNetwork('ddb-reuse');
      assert.strictEqual(network.id, 'existing-network-id');
      assert.strictEqual(network.name, 'ddb-reuse');
      assert.strictEqual(network.reused, true);
    },
  );
});

test('Unit: startContainer starts and waits for running state', async (t) => {
  await t.test(
    'startContainer delegates to docker start then waitForRunning',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
      let startedContainerId = null;
      let waitedForContainerId = null;
      let waitedForTimeout = null;

      provider._docker.getContainer = (containerId) => ({
        start: async () => {
          startedContainerId = containerId;
        },
      });
      provider._waitForRunning = async (containerId, timeout) => {
        waitedForContainerId = containerId;
        waitedForTimeout = timeout;
      };

      await provider.startContainer('container-start-1', 1234);
      assert.strictEqual(startedContainerId, 'container-start-1');
      assert.strictEqual(waitedForContainerId, 'container-start-1');
      assert.strictEqual(waitedForTimeout, 1234);
    },
  );
});

test('Unit: inspectContainerIfExists returns null for missing containers', async (t) => {
  await t.test(
    'inspectContainerIfExists suppresses only Docker not-found errors',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
      provider._docker.getContainer = () => ({
        inspect: async () => {
          const error = new Error('No such container');
          error.statusCode = 404;
          throw error;
        },
      });

      const result = await provider.inspectContainerIfExists('missing');
      assert.strictEqual(result, null);
    },
  );
  await t.test('inspectContainerIfExists preserves transient errors', async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    provider._docker.getContainer = () => ({
      inspect: async () => {
        const error = new Error('daemon unavailable');
        error.statusCode = 503;
        throw error;
      },
    });
    await assert.rejects(
      provider.inspectContainerIfExists('unknown'),
      /daemon unavailable/u,
    );
  });
});

test('Unit: buildImage reports errors with build output', async (t) => {
  await t.test(
    'throws error including build output when build stream contains error',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      const fakeStream = {};
      provider._docker.buildImage = async () => fakeStream;

      // Mock _collectBuildOutput to return output with an error line
      provider._collectBuildOutput = async () => [
        {stream: 'Step 1/5 : FROM node:22\n'},
        {stream: 'Step 2/5 : COPY . /app\n'},
        {error: 'COPY failed: file not found in build context'},
      ];

      await assert.rejects(
        () => provider.buildImage('/project', 'myimage:latest'),
        (err) => {
          assert.ok(
            err.message.includes('build failed'),
            `Error should mention build failure: ${err.message}`,
          );
          assert.ok(
            err.message.includes('myimage:latest'),
            `Error should include the image tag: ${err.message}`,
          );
          assert.ok(
            err.message.includes('COPY failed'),
            `Error should include the build error detail: ${err.message}`,
          );
          assert.ok(
            err.message.includes('Build output'),
            `Error should include build output section: ${err.message}`,
          );
          return true;
        },
      );
    },
  );

  await t.test(
    'throws error when docker.buildImage itself rejects',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      provider._docker.buildImage = async () => {
        throw new Error('daemon connection refused');
      };

      await assert.rejects(
        () => provider.buildImage('/project', 'myimage:v2'),
        (err) => {
          assert.ok(
            err.message.includes('build failed'),
            `Error should mention build failure: ${err.message}`,
          );
          assert.ok(
            err.message.includes('myimage:v2'),
            `Error should include the image tag: ${err.message}`,
          );
          assert.ok(
            err.message.includes('daemon connection refused'),
            `Error should include original cause: ${err.message}`,
          );
          return true;
        },
      );
    },
  );
});

test('Unit: buildImage passes labels to docker build options', async (t) => {
  await t.test(
    'sends explicit build-context entries required by dockerode tar packing',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedBuildContext = null;
      let capturedBuildOptions = null;
      provider._docker.buildImage = async (context, options) => {
        capturedBuildContext = context;
        capturedBuildOptions = options;
        return {};
      };
      provider._collectBuildOutput = async () => [];

      await provider.buildImage(
        '/project',
        'myimage:context',
        'Dockerfile',
        null,
        {'ddb.git-hash': 'abc1234'},
      );

      assert.deepStrictEqual(capturedBuildContext, {
        context: '/project',
        src: ['Dockerfile', 'package-lock.json', 'package.json', 'src'],
      });
      assert.deepStrictEqual(capturedBuildOptions, {
        t: 'myimage:context',
        dockerfile: 'Dockerfile',
        labels: {'ddb.git-hash': 'abc1234'},
      });
    },
  );

  await t.test(
    'forwards labels to docker buildImage options',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      let capturedBuildOptions = null;
      provider._docker.buildImage = async (_context, options) => {
        capturedBuildOptions = options;
        return {};
      };
      provider._collectBuildOutput = async () => [];

      await provider.buildImage(
        '/project',
        'myimage:labeled',
        'Dockerfile',
        null,
        {'ddb.git-hash': 'abc1234'},
      );

      assert.ok(capturedBuildOptions, 'docker build options should be captured');
      assert.deepStrictEqual(
        capturedBuildOptions.labels,
        {'ddb.git-hash': 'abc1234'},
      );
    },
  );
});

test('Unit: image metadata helpers read inspect labels', async (t) => {
  await t.test(
    'getImageLabel and imageExists return expected values',
    async () => {
      const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});

      provider._docker.getImage = () => ({
        inspect: async () => ({
          Config: {
            Labels: {
              'ddb.git-hash': 'abc1234',
            },
          },
        }),
      });

      const label = await provider.getImageLabel(
        'distributed-db:test',
        'ddb.git-hash',
      );
      const exists = await provider.imageExists('distributed-db:test');

      assert.strictEqual(label, 'abc1234');
      assert.strictEqual(exists, true);
    },
  );
});

test('Unit: getContainerLogs normalizes numeric tail option to string',
  async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    let capturedLogOpts = null;

    provider._docker.getContainer = () => ({
      logs: async (logOpts) => {
        capturedLogOpts = logOpts;
        return Buffer.from('line-a\nline-b\n', 'utf8');
      },
    });

    const logs = await provider.getContainerLogs('container-logs-tail', {
      tail: 50,
    });

    assert.strictEqual(capturedLogOpts.tail, '50');
    assert.strictEqual(logs, 'line-a\nline-b\n');
  });

test('Unit: getContainerLogs retries with safe tail after oversized payload error',
  async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    let callCount = 0;
    let fallbackLogOpts = null;

    provider._docker.getContainer = () => ({
      logs: async (logOpts) => {
        callCount += 1;
        if (callCount === 1) {
          const error = new Error('payload too large');
          error.code = 'ERR_STRING_TOO_LONG';
          throw error;
        }
        fallbackLogOpts = logOpts;
        return Buffer.from('trimmed-log-line\n', 'utf8');
      },
    });

    const logs = await provider.getContainerLogs('container-logs-large');

    assert.strictEqual(callCount, 2);
    assert.strictEqual(fallbackLogOpts.tail, '50');
    assert.strictEqual(logs, 'trimmed-log-line\n');
  });

test('Unit: parseContainerStats computes cpu/memory/network metrics', async () => {
  const stats = {
    read: '2026-02-14T00:00:00.000Z',
    cpu_stats: {
      cpu_usage: {
        total_usage: 2000000000,
        percpu_usage: [100, 100],
      },
      system_cpu_usage: 4000000000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: {
        total_usage: 1000000000,
      },
      system_cpu_usage: 2000000000,
    },
    memory_stats: {
      usage: 123456,
      limit: 654321,
    },
    pids_stats: {current: 7},
    blkio_stats: {
      io_service_bytes_recursive: [
        {op: 'Read', value: 7000},
        {op: 'Write', value: 9000},
      ],
      io_serviced_recursive: [
        {op: 'Read', value: 11},
        {op: 'Write', value: 13},
      ],
    },
    networks: {
      eth0: {
        rx_bytes: 1000,
        tx_bytes: 2000,
      },
      eth1: {
        rx_bytes: 3000,
        tx_bytes: 4000,
      },
    },
  };

  const parsed = parseContainerStats(stats);
  assert.equal(parsed.timestamp, Date.parse(stats.read));
  assert.equal(parsed.memoryUsageBytes, 123456);
  assert.equal(parsed.memoryLimitBytes, 654321);
  assert.equal(parsed.cpuUsageNanoseconds, 2000000000);
  assert.equal(parsed.pids, 7);
  assert.equal(parsed.rxBytes, 4000);
  assert.equal(parsed.txBytes, 6000);
  assert.equal(parsed.blockReadBytes, 7000);
  assert.equal(parsed.blockWriteBytes, 9000);
  assert.equal(parsed.blockReadOperations, 11);
  assert.equal(parsed.blockWriteOperations, 13);
  assert.ok(parsed.cpuPercent > 0);
});

test('Unit: getContainerStats reads non-stream docker stats', async () => {
  const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
  let capturedOptions = null;

  provider._docker.getContainer = () => ({
    stats: async (options) => {
      capturedOptions = options;
      return {
        cpu_stats: {
          cpu_usage: {total_usage: 2},
          system_cpu_usage: 4,
          online_cpus: 1,
        },
        precpu_stats: {
          cpu_usage: {total_usage: 1},
          system_cpu_usage: 2,
        },
        memory_stats: {
          usage: 10,
          limit: 20,
        },
        networks: {
          eth0: {
            rx_bytes: 30,
            tx_bytes: 40,
          },
        },
      };
    },
  });

  const result = await provider.getContainerStats('container-1');
  assert.deepStrictEqual(capturedOptions, {stream: false});
  assert.equal(result.memoryUsageBytes, 10);
  assert.equal(result.memoryLimitBytes, 20);
  assert.equal(result.cpuUsageNanoseconds, 2);
  assert.equal(result.pids, 0);
  assert.equal(result.rxBytes, 30);
  assert.equal(result.txBytes, 40);
  assert.equal(result.blockReadBytes, 0);
  assert.equal(result.blockWriteBytes, 0);
  assert.equal(result.blockReadOperations, 0);
  assert.equal(result.blockWriteOperations, 0);
});

test('Unit: resource snapshot includes writable-layer storage usage',
  async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    let inspectOptions = null;
    provider._docker.getContainer = () => ({
      stats: async () => ({
        cpu_stats: {cpu_usage: {total_usage: 2}},
        memory_stats: {usage: 10, limit: 20},
      }),
      inspect: async (options) => {
        inspectOptions = options;
        return {
          SizeRw: 4096,
          HostConfig: {NanoCpus: 1_000_000_000},
        };
      },
    });

    const result =
      await provider.getContainerResourceSnapshot('container-resource');
    assert.deepStrictEqual(inspectOptions, {size: true});
    assert.equal(result.storageUsageBytes, 4096);
    assert.equal(result.storageLimitBytes, 0);
    assert.equal(result.cpuLimitNanoCpus, 1_000_000_000);
    assert.equal(result.cpuUsageNanoseconds, 2);
  });

test('Unit: resource snapshot measures a bounded container storage path',
  async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    provider._docker.getContainer = () => ({
      stats: async () => ({
        cpu_stats: {cpu_usage: {total_usage: 2}},
        memory_stats: {usage: 10, limit: 20},
      }),
      inspect: async () => ({
        HostConfig: {
          NanoCpus: 1_000_000_000,
          Tmpfs: {'/data': 'rw,size=8192'},
        },
      }),
    });
    let observedContainerId = null;
    let observedCommand = null;
    provider.execInContainer = async (containerId, command) => {
      observedContainerId = containerId;
      observedCommand = command;
      return {
        exitCode: 0,
        stdout: '4096\t/data\n',
        stderr: '',
      };
    };

    const result = await provider.getContainerResourceSnapshot(
      RESOURCE_SNAPSHOT_CONTAINER_ID,
      RESOURCE_SNAPSHOT_STORAGE_PATH,
    );
    assert.equal(observedContainerId, RESOURCE_SNAPSHOT_CONTAINER_ID);
    assert.deepStrictEqual(observedCommand, RESOURCE_SNAPSHOT_STORAGE_COMMAND);
    assert.equal(result.storageUsageBytes, 4096);
    assert.equal(result.storageLimitBytes, 8192);
    assert.equal(result.cpuLimitNanoCpus, 1_000_000_000);

    for (const stdout of RESOURCE_SNAPSHOT_INVALID_OUTPUTS) {
      provider.execInContainer = async () => ({
        exitCode: 0,
        stdout,
        stderr: '',
      });
      await assert.rejects(
        provider.getContainerResourceSnapshot(
          RESOURCE_SNAPSHOT_CONTAINER_ID,
          RESOURCE_SNAPSHOT_STORAGE_PATH,
        ),
        /not a safe byte count/u,
      );
    }
  });

test('Unit: resource snapshot can use the inspected writable layer',
  async () => {
    const provider = new DockerProvider({socketPath: '/var/run/docker.sock'});
    provider._docker.getContainer = () => ({
      stats: async () => ({
        cpu_stats: {cpu_usage: {total_usage: 2}},
        memory_stats: {usage: 10, limit: 20},
      }),
      inspect: async () => ({
        SizeRw: 12_345,
        HostConfig: {NanoCpus: 1_000_000_000},
      }),
    });
    provider.execInContainer = async () => {
      throw new Error('distroless writable-layer accounting must not exec');
    };
    const result = await provider.getContainerResourceSnapshot(
      RESOURCE_SNAPSHOT_CONTAINER_ID,
      DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    );
    assert.equal(result.storageUsageBytes, 12_345);
  });
