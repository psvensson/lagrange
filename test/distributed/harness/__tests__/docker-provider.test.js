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
import {DockerProvider} from '../docker-provider.js';
import {CONTAINER_ENV_KEYS} from '../constants.js';

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
        [CONTAINER_ENV_KEYS.NODE_ADDRESS]: '172.18.0.2:9080',
        [CONTAINER_ENV_KEYS.SEED_NODE_ADDRESS]: '172.18.0.1:9080',
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
        'NODE_ADDRESS=172.18.0.2:9080',
        'SEED_NODE_ADDRESS=172.18.0.1:9080',
        'DATA_DIR=/data/node-1',
      ];
      for (const entry of expectedEntries) {
        assert.ok(
          capturedOpts.Env.includes(entry),
          `Env should contain "${entry}"`,
        );
      }
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
