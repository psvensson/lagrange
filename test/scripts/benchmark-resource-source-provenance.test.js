import assert from 'node:assert/strict';
import {access, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectBenchmarkResourceSourceProvenance,
} from '../../scripts/checks/benchmark-resource-source-provenance.js';
import {
  cleanupMovielensPairedCapacityEnvironment,
} from '../../scripts/checks/movielens-paired-capacity-live-environment.js';
import {
  parsePairedRuntimeReplayOutput,
  parseProcNetworkBytes,
  serializePairedRuntimeReport,
} from '../../scripts/checks/run-comparative-efficiency-movielens-paired-runtime-adapters-live.js';

test('source provenance binds an untracked runtime source by content', async () => {
  const directory = path.join(
    'test-output',
    `benchmark-source-provenance-${process.pid}-${Date.now()}`,
  );
  const sourcePath = path.join(directory, 'untracked-runtime-source.js');
  await mkdir(directory, {recursive: true});
  try {
    await writeFile(sourcePath, 'export const observed = true;\n');
    const first =
      await collectBenchmarkResourceSourceProvenance([sourcePath]);
    await writeFile(sourcePath, 'export const observed = false;\n');
    const second =
      await collectBenchmarkResourceSourceProvenance([sourcePath]);
    assert.match(first.sourceRevision, /^git-delta:/u);
    assert.match(first.changeFingerprint, /^sha256:[0-9a-f]{64}$/u);
    assert.notEqual(
      first.changeFingerprint,
      second.changeFingerprint,
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('paired environment preserves primary and cleanup failures', async () => {
  const storage = await mkdtemp(
    path.join(tmpdir(), 'movielens-cleanup-fixture-'),
  );
  const primary = new Error('primary capacity failure');
  const cleanup = new Error('Lagrange cleanup failure');
  let postgresqlClosed = false;
  await assert.rejects(
    cleanupMovielensPairedCapacityEnvironment({
      lagrange: {
        async close() {
          throw cleanup;
        },
      },
      postgresql: {
        async close() {
          postgresqlClosed = true;
          return {containersAbsent: true};
        },
      },
      postgresqlClientStoragePath: storage,
      primaryError: primary,
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual(error.errors, [primary, cleanup]);
      return true;
    },
  );
  assert.equal(postgresqlClosed, true);
  await assert.rejects(access(storage), {code: 'ENOENT'});
});

test('live proc and JSON boundaries use trusted captured intrinsics', () => {
  const stringMethods = ['indexOf', 'slice', 'split', 'trim'];
  const arrayMethods = ['map', 'slice'];
  const descriptors = [];
  for (const [target, names] of [
    [String.prototype, stringMethods],
    [Array.prototype, arrayMethods],
  ]) {
    for (const name of names) {
      descriptors.push([
        target,
        name,
        Object.getOwnPropertyDescriptor(target, name),
      ]);
    }
  }
  const numberDescriptor =
    Object.getOwnPropertyDescriptor(Number, 'isSafeInteger');
  const jsonParseDescriptor =
    Object.getOwnPropertyDescriptor(JSON, 'parse');
  const jsonStringifyDescriptor =
    Object.getOwnPropertyDescriptor(JSON, 'stringify');
  let total;
  let parsed;
  let serialized;
  try {
    for (const [target, name] of descriptors) {
      Object.defineProperty(target, name, {
        configurable: true,
        value() {
          throw new Error(`poisoned ${name}`);
        },
      });
    }
    Object.defineProperty(Number, 'isSafeInteger', {
      configurable: true,
      value() {
        throw new Error('poisoned Number.isSafeInteger');
      },
    });
    Object.defineProperty(JSON, 'parse', {
      configurable: true,
      value() {
        throw new Error('poisoned JSON.parse');
      },
    });
    Object.defineProperty(JSON, 'stringify', {
      configurable: true,
      value() {
        throw new Error('poisoned JSON.stringify');
      },
    });
    total = parseProcNetworkBytes(
      'Inter-| Receive | Transmit\n' +
      ' face |bytes packets errs drop fifo frame compressed multicast|' +
      'bytes packets errs drop fifo colls carrier compressed\n' +
      '  eth0: 10 1 0 0 0 0 0 0 20 1 0 0 0 0 0 0\n',
    );
    parsed = parsePairedRuntimeReplayOutput('{"valid":true}');
    serialized = serializePairedRuntimeReport({valid: true});
  } finally {
    for (const [target, name, descriptor] of descriptors) {
      Object.defineProperty(target, name, descriptor);
    }
    Object.defineProperty(Number, 'isSafeInteger', numberDescriptor);
    Object.defineProperty(JSON, 'parse', jsonParseDescriptor);
    Object.defineProperty(JSON, 'stringify', jsonStringifyDescriptor);
  }
  assert.equal(total, 30);
  assert.deepEqual(parsed, {valid: true});
  assert.equal(serialized, '{"valid":true}');
  assert.throws(
    () => parseProcNetworkBytes(
      'header\nheader\neth0: 1e3 0 0 0 0 0 0 0 2 0 0 0 0 0 0 0\n',
    ),
    /malformed/u,
  );
});
