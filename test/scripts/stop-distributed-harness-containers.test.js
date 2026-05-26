import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {
  commandMatchesHarnessPattern,
  findHarnessProcesses,
  formatHumanSummary,
  isHarnessContainer,
  isHarnessProcess,
  parseArgs,
  parsePsOutput,
  stopHarnessContainers,
  stopHarnessProcesses,
} from '../../scripts/stop-distributed-harness-containers.js';

test('distributed harness stop command parses cleanup flags', (t) => {
  assert.deepStrictEqual(
    parseArgs([
      '--dry-run',
      '--remove',
      '--socket-path',
      '/tmp/docker.sock',
      '--json',
    ]),
    {
      dryRun: true,
      remove: true,
      socketPath: '/tmp/docker.sock',
      json: true,
      help: false,
      containersOnly: false,
      processesOnly: false,
    },
  );
  t.end();
});

test('distributed harness stop command parses scope flags', (t) => {
  assert.equal(parseArgs(['--containers-only']).containersOnly, true);
  assert.equal(parseArgs(['--processes-only']).processesOnly, true);
  assert.throws(
    () => parseArgs(['--containers-only', '--processes-only']),
    /Cannot combine/u,
  );
  t.end();
});

test('distributed harness stop command identifies harness containers', (t) => {
  assert.equal(
    isHarnessContainer({
      Names: ['/ddb-test-reuse-5-1'],
      Labels: {},
    }),
    true,
  );
  assert.equal(
    isHarnessContainer({
      Names: ['/ddb-test-abcdef12-seed-1'],
      Labels: {},
    }),
    true,
  );
  assert.equal(
    isHarnessContainer({
      Names: ['/random-name'],
      Labels: {'ddb-test.cluster': 'cluster-1'},
    }),
    true,
  );
  assert.equal(
    isHarnessContainer({
      Names: ['/postgres'],
      Labels: {'com.example.owner': 'not-harness'},
    }),
    false,
  );
  t.end();
});

test('distributed harness stop command stops only running harness containers',
  async () => {
    const calls = [];
    const provider = {
      listContainers: async () => [
        {
          Id: 'reuse-running',
          Names: ['/ddb-test-reuse-5-1'],
          Labels: {},
          State: 'running',
        },
        {
          Id: 'labeled-running',
          Names: ['/worker-a'],
          Labels: {'ddb-test.cluster': 'cluster-2'},
          Status: 'Up 4 minutes',
        },
        {
          Id: 'reuse-stopped',
          Names: ['/ddb-test-reuse-5-2'],
          Labels: {},
          State: 'exited',
        },
        {
          Id: 'unrelated-running',
          Names: ['/postgres'],
          Labels: {},
          State: 'running',
        },
      ],
      stopContainer: async (id) => {
        calls.push(['stop', id]);
      },
      removeContainer: async (id) => {
        calls.push(['remove', id]);
      },
    };

    const summary = await stopHarnessContainers(provider);

    assert.equal(summary.matched, 3);
    assert.equal(summary.stopped, 2);
    assert.equal(summary.removed, 0);
    assert.equal(summary.errors, 0);
    assert.deepStrictEqual(calls, [
      ['stop', 'reuse-running'],
      ['stop', 'labeled-running'],
    ]);
  });

test('distributed harness stop command supports dry-run and remove modes',
  async () => {
    const calls = [];
    const provider = {
      listContainers: async () => [
        {
          Id: 'running',
          Names: ['/ddb-test-reuse-3-1'],
          Labels: {},
          State: 'running',
        },
        {
          Id: 'stopped',
          Names: ['/ddb-test-reuse-3-2'],
          Labels: {},
          State: 'exited',
        },
      ],
      stopContainer: async (id) => {
        calls.push(['stop', id]);
      },
      removeContainer: async (id) => {
        calls.push(['remove', id]);
      },
    };

    const dryRunSummary = await stopHarnessContainers(provider, {dryRun: true});
    assert.equal(dryRunSummary.matched, 2);
    assert.equal(dryRunSummary.stopped, 0);
    assert.deepStrictEqual(calls, []);

    const removeSummary = await stopHarnessContainers(provider, {remove: true});
    assert.equal(removeSummary.matched, 2);
    assert.equal(removeSummary.stopped, 1);
    assert.equal(removeSummary.removed, 2);
    assert.deepStrictEqual(calls, [
      ['stop', 'running'],
      ['remove', 'running'],
      ['remove', 'stopped'],
    ]);
  });

test('distributed harness stop command formats a no-container summary', (t) => {
  assert.equal(
    formatHumanSummary({
      containers: {
        matched: 0,
        stopped: 0,
        removed: 0,
        errors: 0,
        results: [],
      },
      processes: {skipped: true},
    }),
    'No distributed harness containers found.\nSkipped local harness process cleanup.',
  );
  t.end();
});

test('distributed harness stop command matches harness command lines', (t) => {
  assert.equal(
    commandMatchesHarnessPattern('node test/distributed/run.js --config x'),
    true,
  );
  assert.equal(
    commandMatchesHarnessPattern(
      'bash scripts/run-all-distributed-scenarios.sh --verbose',
    ),
    true,
  );
  assert.equal(
    commandMatchesHarnessPattern(
      'node test/distributed/validate-node-join-under-load.js',
    ),
    true,
  );
  assert.equal(commandMatchesHarnessPattern('node src/server.js'), false);
  t.end();
});

test('distributed harness stop command parses ps output', (t) => {
  const psOutput = [
    ' 1234  1000 node test/distributed/run.js --config local.json',
    ' 1235  1234 bash scripts/run-all-distributed-scenarios.sh',
    ' 9999  1000 node src/server.js',
  ].join('\n');

  const parsed = parsePsOutput(psOutput);
  assert.equal(parsed.length, 3);
  assert.deepStrictEqual(parsed[0], {
    pid: 1234,
    ppid: 1000,
    command: 'node test/distributed/run.js --config local.json',
  });

  const harness = findHarnessProcesses(psOutput);
  assert.equal(harness.length, 2);
  assert.deepStrictEqual(
    harness.map((entry) => entry.pid).sort((a, b) => a - b),
    [1234, 1235],
  );
  t.end();
});

test('distributed harness stop command excludes self pid', (t) => {
  assert.equal(
    isHarnessProcess(
      {pid: 4242, ppid: 1, command: 'node test/distributed/run.js'},
      new Set([4242]),
    ),
    false,
  );
  t.end();
});

test('distributed harness stop command terminates harness processes',
  async () => {
    const killed = [];
    const summary = await stopHarnessProcesses(
      {},
      {
        listProcesses: async () => [
          '111 1 node test/distributed/run.js --config local.json',
          '222 1 node src/server.js',
          '333 1 bash scripts/run-all-distributed-scenarios.sh',
        ].join('\n'),
        killProcess: (pid, signal) => {
          killed.push([pid, signal]);
          if (signal === 0) {
            return false;
          }
          return true;
        },
        sleep: async () => undefined,
        selfPid: 99999,
      },
    );

    assert.equal(summary.matched, 2);
    assert.equal(summary.stopped, 2);
    assert.equal(summary.errors, 0);
    assert.deepStrictEqual(
      killed.filter((entry) => entry[1] === 'SIGTERM').map((entry) => entry[0]),
      [111, 333],
    );
    assert.equal(
      killed.some((entry) => entry[1] === 'SIGKILL'),
      false,
    );
  });

test('distributed harness stop command escalates to SIGKILL when needed',
  async () => {
    const killed = [];
    const summary = await stopHarnessProcesses(
      {},
      {
        listProcesses: async () =>
          '111 1 node test/distributed/run.js --config local.json',
        killProcess: (pid, signal) => {
          killed.push([pid, signal]);
          if (signal === 0) {
            return true;
          }
          return true;
        },
        sleep: async () => undefined,
        selfPid: 99999,
      },
    );

    assert.equal(summary.stopped, 1);
    assert.deepStrictEqual(killed, [
      [111, 'SIGTERM'],
      [111, 0],
      [111, 'SIGKILL'],
    ]);
    assert.equal(summary.results[0].signal, 'SIGKILL');
  });

test('distributed harness stop command supports dry-run for processes',
  async () => {
    const killed = [];
    const summary = await stopHarnessProcesses(
      {dryRun: true},
      {
        listProcesses: async () =>
          '111 1 node test/distributed/run.js --config local.json',
        killProcess: (pid, signal) => {
          killed.push([pid, signal]);
          return true;
        },
        sleep: async () => undefined,
        selfPid: 99999,
      },
    );

    assert.equal(summary.matched, 1);
    assert.equal(summary.stopped, 0);
    assert.deepStrictEqual(killed, []);
    assert.equal(summary.results[0].dryRun, true);
  });

test('distributed harness stop command reports process discovery errors',
  async () => {
    const summary = await stopHarnessProcesses(
      {},
      {
        listProcesses: async () => {
          throw new Error('ps not available');
        },
        selfPid: 99999,
      },
    );

    assert.equal(summary.errors, 1);
    assert.match(summary.error, /ps not available/u);
  });
