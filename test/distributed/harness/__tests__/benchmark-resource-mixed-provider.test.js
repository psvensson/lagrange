import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BenchmarkResourceMixedProvider,
} from '../benchmark-resource-mixed-provider.js';
import {
  replacePrototypeProperty,
} from '../../../helpers/hostile-intrinsics.js';

async function fixture() {
  const root = await mkdtemp(
    path.join(tmpdir(), 'lagrange-mixed-provider-'),
  );
  const cgroup = path.join(root, 'cgroup');
  const storage = path.join(root, 'storage');
  await mkdir(cgroup);
  await mkdir(storage);
  const files = {
    'cgroup.procs': `${process.pid}\n`,
    'cpu.stat': 'usage_usec 1234\nuser_usec 1000\nsystem_usec 234\n',
    'cpu.max': '200000 100000\n',
    'memory.current': '1048576\n',
    'memory.stat': 'anon 524288\nfile 524288\ninactive_file 262144\n',
    'memory.max': '67108864\n',
    'pids.current': '2\n',
    'io.stat':
      '8:0 rbytes=100 wbytes=200 rios=3 wios=4 dbytes=0 dios=0\n',
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(cgroup, name), value);
  }
  await writeFile(path.join(storage, 'data'), 'retained bytes');
  const containerProvider = {
    inspectContainer(id) {
      return {Id: id, State: {Running: true}};
    },
    inspectContainerIfExists() {
      return null;
    },
    getContainerResourceSnapshot() {
      throw new Error('unexpected container snapshot');
    },
    getNetworkByName() {
      return null;
    },
  };
  const provider = new BenchmarkResourceMixedProvider({
    containerProvider,
    cgroups: [{
      resourceId: 'lagrange-cgroup',
      cgroupPath: cgroup,
      storagePath: storage,
      storageLimitBytes: 1_073_741_824,
      cpuLimitNanoCpus: 2_000_000_000,
      networkObservation: {
        authority: 'fixture_socket_bytes',
        read() {
          return {
            authority: 'fixture_socket_bytes',
            rxBytes: 50,
            txBytes: 70,
          };
        },
      },
    }],
  });
  return {root, cgroup, storage, provider};
}

test('mixed provider meters cgroup process resources through C4 provider seam', async () => {
  const value = await fixture();
  try {
    assert.equal(
      (await value.provider.inspectContainer('lagrange-cgroup'))
        .State.Running,
      true,
    );
    const snapshot =
      await value.provider.getContainerResourceSnapshot(
        'lagrange-cgroup',
        value.storage,
      );
    assert.equal(snapshot.cpuUsageNanoseconds, 1_234_000);
    assert.equal(snapshot.cpuLimitNanoCpus, 2_000_000_000);
    assert.equal(snapshot.memoryUsageBytes, 786_432);
    assert.equal(snapshot.memoryLimitBytes, 67_108_864);
    assert.equal(snapshot.rxBytes + snapshot.txBytes, 120);
    assert.equal(snapshot.blockReadBytes, 100);
    assert.equal(snapshot.blockWriteBytes, 200);
    assert.equal(snapshot.blockReadOperations, 3);
    assert.equal(snapshot.blockWriteOperations, 4);
    assert.ok(snapshot.storageUsageBytes > 0);
  } finally {
    await rm(value.root, {recursive: true, force: true});
  }
});

test('mixed provider falls back when delegated CPU and IO files are absent', async () => {
  const value = await fixture();
  try {
    await rm(path.join(value.cgroup, 'cpu.max'));
    await rm(path.join(value.cgroup, 'io.stat'));
    const snapshot =
      await value.provider.getContainerResourceSnapshot(
        'lagrange-cgroup',
        value.storage,
      );
    assert.equal(snapshot.cpuLimitNanoCpus, 2_000_000_000);
    assert.equal(Number.isSafeInteger(snapshot.blockReadBytes), true);
    assert.equal(Number.isSafeInteger(snapshot.blockWriteBytes), true);
  } finally {
    await rm(value.root, {recursive: true, force: true});
  }
});

test('mixed provider rejects malformed or missing required counters', async () => {
  const cases = [
    ['cpu.stat', 'user_usec 1000\n'],
    ['memory.current', '1234junk\n'],
    ['memory.stat', 'anon 100\n'],
    ['memory.max', 'max\n'],
    ['pids.current', '1e3\n'],
    ['io.stat', '8:0 rbytes=1 wbytes=2 rios=3\n'],
    ['cpu.stat', 'usage_usec 9007199254740991\n'],
    [
      'io.stat',
      '8:0 rbytes=9007199254740991 wbytes=2 rios=3 wios=4\n' +
        '8:1 rbytes=1 wbytes=2 rios=3 wios=4\n',
    ],
  ];
  for (const [name, contents] of cases) {
    const value = await fixture();
    try {
      await writeFile(path.join(value.cgroup, name), contents);
      await assert.rejects(
        value.provider.getContainerResourceSnapshot(
          'lagrange-cgroup',
          value.storage,
        ),
        /resource counter is invalid/u,
      );
    } finally {
      await rm(value.root, {recursive: true, force: true});
    }
  }
});

test('mixed provider rejects a registered storage path that disappears', async () => {
  const value = await fixture();
  try {
    await rm(value.storage, {recursive: true, force: true});
    await assert.rejects(
      value.provider.getContainerResourceSnapshot(
        'lagrange-cgroup',
        value.storage,
      ),
      /registered storage observation is unavailable/u,
    );
  } finally {
    await rm(value.root, {recursive: true, force: true});
  }
});

test('mixed provider parsing survives poisoned mutable intrinsics', async () => {
  const value = await fixture();
  const stringMethods = ['split', 'trim'];
  const poison = (name) => () => {
    throw new Error(`poisoned ${name}`);
  };
  const restores = stringMethods.map((name) =>
    replacePrototypeProperty(
      String.prototype,
      name,
      poison(`String.prototype.${name}`),
    ),
  );
  restores.push(replacePrototypeProperty(
    Number,
    'isSafeInteger',
    poison('Number.isSafeInteger'),
  ));
  let snapshot;
  try {
    snapshot =
      await value.provider.getContainerResourceSnapshot(
        'lagrange-cgroup',
        value.storage,
      );
  } finally {
    for (let index = restores.length - 1; index >= 0; index -= 1) {
      restores[index]();
    }
    await rm(value.root, {recursive: true, force: true});
  }
  assert.equal(snapshot.cpuUsageNanoseconds, 1_234_000);
  assert.equal(snapshot.rxBytes + snapshot.txBytes, 120);
});

test('mixed provider cleanup observation requires cgroup removal', async () => {
  const value = await fixture();
  try {
    assert.notEqual(
      await value.provider.inspectContainerIfExists('lagrange-cgroup'),
      null,
    );
    await rm(value.cgroup, {recursive: true, force: true});
    assert.equal(
      await value.provider.inspectContainerIfExists('lagrange-cgroup'),
      null,
    );
  } finally {
    await rm(value.root, {recursive: true, force: true});
  }
});
