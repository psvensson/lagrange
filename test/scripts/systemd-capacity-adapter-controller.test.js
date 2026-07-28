import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';

import {
  createCapacityAdapterOutbound,
} from '../../scripts/checks/capacity-adapter-outbound.js';
import {
  capacityAdapterProcessClose,
  completeSystemdCapacityAdapterStartup,
  createCapacityAdapterReplyGate,
  parseCapacityAdapterMessage,
  parseSystemdIpAccounting,
  serializeCapacityAdapterMessage,
  systemdCapacityAdapterArguments,
  terminateSystemdCapacityAdapter,
} from '../../scripts/checks/systemd-capacity-adapter-controller.js';
import {
  replacePrototypeProperty,
} from '../helpers/hostile-intrinsics.js';

test('adapter process completion waits for stdio close, not exit', async () => {
  const child = new EventEmitter();
  let settled = false;
  const completion = capacityAdapterProcessClose(child).finally(() => {
    settled = true;
  });
  child.emit('exit', 0, null);
  await Promise.resolve();
  assert.equal(settled, false);
  child.emit('close', 0, null);
  assert.deepEqual(await completion, {code: 0, signal: null});
});

test('adapter stdout delivery waits for the complete large write', async () => {
  let callback;
  let serialized;
  const send = createCapacityAdapterOutbound({
    stdout: {
      write(value, complete) {
        serialized = value;
        callback = complete;
        return false;
      },
    },
  });
  let settled = false;
  const delivery = send({
    kind: 'termination_result',
    value: {receipt: 'x'.repeat(1_048_576)},
  }).finally(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  callback();
  await delivery;
  assert.equal(serialized.endsWith('\n'), true);
  assert.equal(
    JSON.parse(serialized).value.receipt.length,
    1_048_576,
  );
});

test('adapter IPC delivery waits for the send callback', async () => {
  let callback;
  let delivered;
  const send = createCapacityAdapterOutbound({
    send(value, complete) {
      delivered = value;
      callback = complete;
    },
  });
  let settled = false;
  const delivery = send({kind: 'result', value: 42}).finally(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  callback(null);
  await delivery;
  assert.deepEqual(delivered, {kind: 'result', value: 42});
});

test('systemd adapter launch seals memory, tasks, and CPU affinity', () => {
  const args = systemdCapacityAdapterArguments({
    unit: 'movielens-capacity-fixture',
    workingDirectory: '/workspace/lagrange',
    scriptPath: '/workspace/lagrange/scripts/checks/adapter-child.js',
    memoryMax: '2G',
    cpuQuota: '200%',
    cpuSet: '0,1',
    tasksMax: 256,
  });
  assert.deepEqual(args.slice(0, 11), [
    '--user',
    '--quiet',
    '--pipe',
    '--wait',
    '--collect',
    '--unit=movielens-capacity-fixture',
    '--property=MemoryMax=2G',
    '--property=CPUQuota=200%',
    '--property=TasksMax=256',
    '--property=IPAccounting=yes',
    '--working-directory=/workspace/lagrange',
  ]);
  assert.deepEqual(args.slice(11, 14), [
    'taskset',
    '--cpu-list',
    '0,1',
  ]);
  assert.equal(args[args.length - 1].endsWith('adapter-child.js'), true);
});

test('systemd adapter exposes observed ingress and egress counters', () => {
  assert.deepEqual(
    parseSystemdIpAccounting(
      'IPIngressBytes=1234\nIPEgressBytes=5678\n',
    ),
    {rxBytes: 1234, txBytes: 5678},
  );
  assert.throws(
    () => parseSystemdIpAccounting(
      'IPIngressBytes=[no data]\nIPEgressBytes=[no data]\n',
    ),
    /IP accounting counters unavailable/u,
  );
  assert.throws(
    () => parseSystemdIpAccounting(
      'IPIngressBytes=[not set]\nIPEgressBytes=5678\n',
    ),
    /IP accounting counters unavailable/u,
  );
  assert.throws(
    () => parseSystemdIpAccounting(
      'IPIngressBytes=1234junk\nIPEgressBytes=1e3\n',
    ),
    /IP accounting counters unavailable/u,
  );
});

test('systemd counter parsing uses captured trusted intrinsics', () => {
  const stringMethods = [
    'indexOf',
    'slice',
    'split',
    'startsWith',
    'trim',
  ];
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
  restores.push(
    replacePrototypeProperty(
      Number,
      'parseInt',
      poison('Number.parseInt'),
    ),
    replacePrototypeProperty(
      Number,
      'isSafeInteger',
      poison('Number.isSafeInteger'),
    ),
    replacePrototypeProperty(
      JSON,
      'parse',
      poison('JSON.parse'),
    ),
    replacePrototypeProperty(
      JSON,
      'stringify',
      poison('JSON.stringify'),
    ),
  );
  let parsedMessage;
  let serializedMessage;
  try {
    assert.deepEqual(
      parseSystemdIpAccounting(
        'IPIngressBytes=1234\nIPEgressBytes=5678\n',
      ),
      {rxBytes: 1234, txBytes: 5678},
    );
    parsedMessage = parseCapacityAdapterMessage(
      '{"kind":"result","value":1}',
    );
    serializedMessage =
      serializeCapacityAdapterMessage({kind: 'execute'});
  } finally {
    for (let index = restores.length - 1; index >= 0; index -= 1) {
      restores[index]();
    }
  }
  assert.deepEqual(parsedMessage, {kind: 'result', value: 1});
  assert.equal(serializedMessage, '{"kind":"execute"}');
});

test('adapter abort remains pending until the child operation replies', async () => {
  let settled = false;
  let resolveSettlement;
  let rejectSettlement;
  const settlement = new Promise((resolve, reject) => {
    resolveSettlement = resolve;
    rejectSettlement = reject;
  }).finally(() => {
    settled = true;
  });
  const gate = createCapacityAdapterReplyGate({
    resolve: resolveSettlement,
    reject: rejectSettlement,
  });
  gate.abort();
  await Promise.resolve();
  assert.equal(settled, false);
  gate.settle({kind: 'result', value: {status: 'correct'}});
  await assert.rejects(
    settlement,
    (error) => error?.name === 'AbortError',
  );
  assert.equal(settled, true);
});

test('adapter request timeout remains pending until child termination', async () => {
  let settled = false;
  let resolveSettlement;
  let rejectSettlement;
  const settlement = new Promise((resolve, reject) => {
    resolveSettlement = resolve;
    rejectSettlement = reject;
  }).finally(() => {
    settled = true;
  });
  const timeout = new Error('sealed request timeout');
  const gate = createCapacityAdapterReplyGate({
    resolve: resolveSettlement,
    reject: rejectSettlement,
  });
  gate.timeOut(timeout);
  await Promise.resolve();
  assert.equal(settled, false);
  gate.terminate(new Error('adapter child terminated'));
  await assert.rejects(settlement, timeout);
  assert.equal(settled, true);
});

test('adapter termination escalates to SIGKILL within a sealed bound', async () => {
  let resolveExit;
  const exit = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const signals = [];
  const result = await terminateSystemdCapacityAdapter({
    unit: 'movielens-capacity-fixture',
    exit,
    terminationGraceMs: 1,
    forcedTerminationGraceMs: 1,
    async command(_file, args) {
      const signal = args.find((value) => value.startsWith('--signal='));
      signals.push(signal);
      if (signal === '--signal=SIGKILL') {
        resolveExit({code: null, signal: 'SIGKILL'});
      }
    },
  });
  assert.deepEqual(signals, ['--signal=SIGTERM', '--signal=SIGKILL']);
  assert.deepEqual(result, {code: null, signal: 'SIGKILL'});
});

test('adapter termination still escalates when SIGTERM delivery fails', async () => {
  let resolveExit;
  const exit = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const signals = [];
  const result = await terminateSystemdCapacityAdapter({
    unit: 'movielens-capacity-fixture',
    exit,
    terminationGraceMs: 1,
    forcedTerminationGraceMs: 1,
    async command(_file, args) {
      const signal = args.find((value) => value.startsWith('--signal='));
      signals.push(signal);
      if (signal === '--signal=SIGTERM') {
        throw new Error('systemctl SIGTERM delivery failed');
      }
      resolveExit({code: null, signal: 'SIGKILL'});
    },
  });
  assert.deepEqual(signals, ['--signal=SIGTERM', '--signal=SIGKILL']);
  assert.deepEqual(result, {code: null, signal: 'SIGKILL'});
});

test('partial adapter start awaits termination and cgroup absence', async () => {
  const primary = new Error('child start failed');
  const events = [];
  await assert.rejects(
    completeSystemdCapacityAdapterStartup({
      async start() {
        events.push('start');
        throw primary;
      },
      async resolveControlGroupPath() {
        events.push('resolve');
        return '/sys/fs/cgroup/fixture';
      },
      async terminate() {
        events.push('terminated');
        return {code: 0, signal: null};
      },
      async waitForRemoval(cgroupPath) {
        events.push(`removed:${cgroupPath}`);
      },
    }),
    primary,
  );
  assert.deepEqual(events, [
    'start',
    'resolve',
    'terminated',
    'removed:/sys/fs/cgroup/fixture',
  ]);
});

test('control-group resolution failure still awaits child exit', async () => {
  const primary = new Error('control group lookup failed');
  let resolveAttempts = 0;
  let terminated = false;
  await assert.rejects(
    completeSystemdCapacityAdapterStartup({
      async start() {
        return {started: true};
      },
      async resolveControlGroupPath() {
        resolveAttempts += 1;
        throw primary;
      },
      async terminate() {
        terminated = true;
        return {code: 0, signal: null};
      },
      async waitForRemoval() {
        throw new Error('unreachable removal wait');
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 2 &&
      error.errors[0] === primary &&
      error.errors[1] === primary,
  );
  assert.equal(resolveAttempts, 2);
  assert.equal(terminated, true);
});
