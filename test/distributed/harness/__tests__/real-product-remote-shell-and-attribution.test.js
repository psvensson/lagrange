import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import process from 'node:process';
import {describe, it} from 'node:test';

import {readinessDenialOf} from '../benchmark-readiness-denial.js';
import {
  arrayIncludes,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {
  DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS,
  DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS,
  DEFAULT_POSTGRES_FORMATION_DEADLINE_MS,
  DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS,
  DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS,
  DEFAULT_TIDB_FORMATION_DEADLINE_MS,
  DEFAULT_TIDB_OBSERVE_ROLES_DEADLINE_MS,
  DEFAULT_TIDB_PLACEMENT_DEADLINE_MS,
  resolveOperationWindow,
  stripTransientExecutionOptions,
  withExplicitSignalOption,
} from '../real-product-deployment-contract.js';
import {pollReadiness, typedReadiness} from '../real-product-readiness.js';
import {
  classifyRemoteCommandError,
  createInFlightTracker,
  createRemoteDockerProvider,
  createSshCommandRunner,
  createTrackedSshRun,
  errorText,
  settleConcurrentBatch,
  sshOptions,
} from '../real-product-remote-shell.js';
import {
  bindEndpointToContainer,
  createPsqlQueryReader,
} from '../real-product-sql-clients.js';

function nodeScriptExecFile(_file, args, options, callback) {
  const script = args[args.length - 1];
  return execFile(process.execPath, ['-e', script], options, callback);
}

describe('real Node child_process.execFile timeout & createSshCommandRunner', () => {
  it('classifies real Node 22 execFile timeout ({code: null, killed: true, signal: SIGTERM}) ' +
    'as timedOut, transportError, and observerInfrastructure', async () => {
    const rawError = await new Promise((resolve) => {
      execFile(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 5000);'],
        {timeout: 50},
        (error) => resolve(error),
      );
    });
    assert.ok(rawError instanceof Error);
    assert.equal(rawError.code, null);
    assert.equal(rawError.killed, true);
    assert.equal(rawError.signal, 'SIGTERM');

    const classified = classifyRemoteCommandError(rawError);
    assert.equal(classified.timedOut, true);
    assert.equal(classified.aborted, false);
    assert.equal(classified.transportError, true);
    assert.equal(classified.observerInfrastructure, true);

    const sshRun = createSshCommandRunner({
      execFileImpl: nodeScriptExecFile,
      defaultTimeoutMs: 50,
    });
    await assert.rejects(
      sshRun('10.0.0.1', {}, 'setTimeout(() => {}, 5000);', 50),
      (error) => {
        assert.equal(error.timedOut, true);
        assert.equal(error.killed, true);
        assert.equal(error.aborted, false);
        assert.equal(error.transportError, true);
        assert.equal(error.observerInfrastructure, true);
        return true;
      },
    );
  });

  it('rejects as timedOut & observerInfrastructure even when child traps SIGTERM and ' +
    'exits 0 or 143', async () => {
    const sshRun = createSshCommandRunner({
      execFileImpl: nodeScriptExecFile,
      defaultTimeoutMs: 50,
    });
    await assert.rejects(
      sshRun(
        '10.0.0.1',
        {},
        'process.on("SIGTERM", () => process.exit(0)); setTimeout(() => {}, 5000);',
        50,
      ),
      (error) => {
        assert.equal(error.timedOut, true);
        assert.equal(error.killed, true);
        assert.equal(error.code, 0);
        assert.equal(error.transportError, true);
        assert.equal(error.observerInfrastructure, true);
        return true;
      },
    );

    await assert.rejects(
      sshRun(
        '10.0.0.1',
        {},
        'process.on("SIGTERM", () => process.exit(143)); setTimeout(() => {}, 5000);',
        50,
      ),
      (error) => {
        assert.equal(error.timedOut, true);
        assert.equal(error.killed, true);
        assert.equal(error.code, 143);
        assert.equal(error.transportError, true);
        assert.equal(error.observerInfrastructure, true);
        return true;
      },
    );
  });

  it('classifies real AbortSignal cancellation (ABORT_ERR) as aborted: true and ' +
    'observerInfrastructure: false', async () => {
    const controller = new AbortController();
    const sshRun = createSshCommandRunner({
      execFileImpl: nodeScriptExecFile,
      defaultTimeoutMs: 5000,
    });
    setTimeout(() => controller.abort(), 25);
    await assert.rejects(
      sshRun('10.0.0.1', {signal: controller.signal}, 'setTimeout(() => {}, 5000);', 5000),
      (error) => {
        assert.equal(error.name, 'AbortError');
        assert.equal(error.aborted, true);
        assert.equal(error.timedOut, false);
        assert.equal(error.transportError, false);
        assert.equal(error.observerInfrastructure, false);
        return true;
      },
    );
  });

  it('supports host-mapped createSshCommandRunner({hosts, opts}) and sshOptions', async () => {
    assert.deepEqual(sshOptions({sshKey: '/tmp/key'}), [
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-i', '/tmp/key',
    ]);
    const sshRun = createSshCommandRunner({
      hosts: [{ip: '10.0.0.1', sshTarget: 'bench@10.0.0.1'}],
      opts: {},
      execFileImpl: nodeScriptExecFile,
    });
    const out = await sshRun('10.0.0.1', {}, 'process.stdout.write("hello\\n");', 2000);
    assert.equal(out, 'hello');
    await assert.rejects(
      sshRun('10.0.0.99', {}, 'process.stdout.write("no");', 2000),
      /host 10\.0\.0\.99 is not part of this campaign/u,
    );
  });
});

describe('errorText and classifyRemoteCommandError hardening', () => {
  it('preserves error.message when error.stderr is only an SSH warning banner', () => {
    const err = new Error('Command failed: ssh 10.0.0.1 docker ps');
    err.stderr = 'Warning: Permanently added \'10.0.0.1\' (ED25519) to the list of known hosts.\n';
    err.killed = true;
    err.code = null;
    err.signal = 'SIGTERM';
    const text = errorText(err);
    assert.equal(stringIncludes(text, 'Command failed: ssh 10.0.0.1 docker ps'), true);
    assert.equal(stringIncludes(text, 'Warning: Permanently added'), true);
    const classified = classifyRemoteCommandError(err);
    assert.equal(classified.timedOut, true);
    assert.equal(classified.observerInfrastructure, true);
  });

  it('classifies local spawn/process errors and Docker 125..127 as observerInfrastructure, ' +
    'and curl: (7) as product transport failure', () => {
    for (const sample of [
      Object.assign(new Error('spawn ssh ENOENT'), {code: 'ENOENT', syscall: 'spawn ssh'}),
      Object.assign(new Error('stdout maxBuffer length exceeded'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      }),
      Object.assign(new Error('killed by signal'), {code: null, signal: 'SIGKILL'}),
    ]) {
      const classified = classifyRemoteCommandError(sample);
      assert.equal(classified.transportError, true, sample.message);
      assert.equal(classified.observerInfrastructure, true, sample.message);
    }

    const dockerDaemon = classifyRemoteCommandError(
      Object.assign(new Error('docker exec failed'), {exitCode: 125}),
    );
    assert.equal(dockerDaemon.observerInfrastructure, true);

    const curlRefused = classifyRemoteCommandError(
      new Error('curl: (7) Failed to connect to 10.0.0.1 port 8080: Connection refused'),
    );
    assert.equal(curlRefused.transportError, true);
    assert.equal(curlRefused.observerInfrastructure, false);
  });

  it('stamps AbortError and aborted: true on createTrackedSshRun pre-start and in-flight aborts',
    async () => {
      const preAborted = new AbortController();
      preAborted.abort();
      const {trackedSshRun: preTracked} = createTrackedSshRun(async () => 'ok', preAborted.signal);
      await assert.rejects(preTracked('10.0.0.1', {}, 'echo 1', 1000), (err) => {
        assert.equal(err.name, 'AbortError');
        assert.equal(err.aborted, true);
        return true;
      });

      const inFlight = new AbortController();
      const {trackedSshRun, settleInFlight} = createTrackedSshRun(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 30)),
        inFlight.signal,
      );
      setTimeout(() => inFlight.abort(), 5);
      await assert.rejects(trackedSshRun('10.0.0.1', {}, 'echo 2', 1000), (err) => {
        assert.equal(err.name, 'AbortError');
        assert.equal(err.aborted, true);
        return true;
      });
      await settleInFlight();
    });
});

describe('settleConcurrentBatch priority and non-overlapping settlement', () => {
  it('awaits all items and settleInFlight before rethrowing highest-priority rejection',
    async () => {
      const tracker = createInFlightTracker();
      const events = [];
      const items = ['ordinary', 'infra', 'deadline', 'abort', 'terminal'];
      await assert.rejects(
        settleConcurrentBatch(
          items,
          (kind) => tracker.trackInFlight(async () => {
            if (kind === 'ordinary') {
              events.push('ordinary-reject');
              throw new Error('ordinary failure');
            }
            if (kind === 'infra') {
              await new Promise((resolve) => setTimeout(resolve, 5));
              events.push('infra-reject');
              throw Object.assign(new Error('infra failure'), {observerInfrastructure: true});
            }
            if (kind === 'deadline') {
              await new Promise((resolve) => setTimeout(resolve, 10));
              events.push('deadline-reject');
              throw Object.assign(new Error('deadline failure'), {deadlineExpired: true});
            }
            if (kind === 'abort') {
              await new Promise((resolve) => setTimeout(resolve, 15));
              events.push('abort-reject');
              throw Object.assign(new Error('abort failure'), {aborted: true});
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
            events.push('terminal-reject');
            throw Object.assign(new Error('terminal container exit'), {terminal: true});
          }),
          tracker.settleInFlight,
        ),
        (error) => {
          assert.equal(error.terminal, true);
          assert.equal(error.message, 'terminal container exit');
          return true;
        },
      );
      assert.equal(tracker.inFlightOps.size, 0);
      assert.equal(events.length, 5);
    });
});

describe('createRemoteDockerProvider, psqlText, and bindEndpointToContainer', () => {
  it('tags Docker exit code 125 as observerInfrastructure in execInContainer and ' +
    'enforces pre-flight abort/deadline in provider methods', async () => {
    const provider = createRemoteDockerProvider({
      sshRun: async () => 'docker daemon error\n__exit_code=125',
      opts: {},
      hostOf: () => '10.0.0.1',
    });
    const execRes = await provider.execInContainer('c1', ['mysql', '-e', 'SELECT 1']);
    assert.equal(execRes.exitCode, 125);
    assert.equal(execRes.observerInfrastructure, true);

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      provider.inspectContainer('c1', {signal: aborted.signal}),
      (err) => err.aborted === true && err.name === 'AbortError',
    );
    await assert.rejects(
      provider.inspectContainerState('c1', {timeoutMs: 0}),
      (err) => err.deadlineExpired === true,
    );
  });

  it('psqlText preserves explicit signal: null and adds 2000ms SSH transport grace over ' +
    'statement_timeout unless capped by caller timeoutMs', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const recordedCalls = [];
    const sshRun = async (_host, callOpts, command, timeoutMs) => {
      recordedCalls.push({callOpts, command, timeoutMs});
      return 'col\nval\n';
    };
    const query = createPsqlQueryReader({
      sshRun,
      opts: {signal: aborted.signal},
      from: '10.0.0.9',
      campaignId: 'camp-sql',
      endpoint: {host: '10.0.0.1', port: 5432},
      connection: {user: 'u', password: 'p', database: 'd'},
    });
    const rows = await query('SELECT 1 AS col', {signal: null});
    assert.deepEqual(rows, [{col: 'val'}]);
    assert.equal(recordedCalls[0].callOpts.signal, null);
    assert.equal(recordedCalls[0].timeoutMs, 17_000);
    assert.equal(stringIncludes(recordedCalls[0].command, 'statement_timeout=13500'), true);
  });

  it('bindEndpointToContainer rethrows aborted and deadlineExpired instead of ' +
    'swallowing them into 0 campaign containers', async () => {
    const controller = new AbortController();
    let probe2Settled = false;
    const sshRun = async (_host, _opts, command) => {
      if (stringIncludes(command, 'container:c1')) {
        controller.abort();
        const err = new Error('ssh operation aborted');
        err.name = 'AbortError';
        err.aborted = true;
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
      probe2Settled = true;
      return 'owner=yes\n';
    };
    await assert.rejects(
      bindEndpointToContainer({
        sshRun,
        opts: {},
        campaignId: 'camp-bind',
        endpoint: {host: '10.0.0.1', port: 5432},
        candidates: [
          {containerId: 'c1', role: 'lagrange-node'},
          {containerId: 'c2', role: 'lagrange-node'},
        ],
        signal: controller.signal,
      }),
      (err) => err.aborted === true,
    );
    assert.equal(probe2Settled, true);
  });
});

describe('pollReadiness & typedReadiness attribution matrix', () => {
  const noSleep = async () => {};

  it('Case A (Finding #4A): 1 ready: true followed by SSH observer errors with stablePolls: 3 ' +
    'classifies observerInfrastructure: true and never produces state: denied, reasons: []',
  async () => {
    let n = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 3,
        stablePolls: 3,
        intervalMs: 0,
        sleep: noSleep,
        probe: async () => {
          n += 1;
          if (n === 1) return {ready: true, diagnostic: {denials: []}};
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.code, 'readiness_exhausted');
        assert.equal(error.observerInfrastructure, true);
        assert.equal(error.diagnostic.observerInfrastructure, true);
        assert.equal(error.readyAttempts, 1);
        assert.equal(error.deniedAttempts, 0);
        assert.equal(error.lastCompletedReady, true);
        assert.equal(error.lastObservation.observerInfrastructure, true);
        const denial = readinessDenialOf({
          deployment: {readiness: {evidence: {diagnostic: error.diagnostic}}},
        });
        assert.equal(denial.state, 'probe-failed');
        assert.equal(arrayIncludes(denial.reasons,
          'ssh: connect to host 10.0.0.1 port 22: Connection timed out'), true);
        return true;
      },
    );
  });

  it('Case B: product denial followed by SSH observer errors without recovery classifies ' +
    'observerInfrastructure: false', async () => {
    let n = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 3,
        stablePolls: 3,
        intervalMs: 0,
        sleep: noSleep,
        probe: async () => {
          n += 1;
          if (n === 1) return {ready: false, diagnostic: {denials: ['quorum_unmet']}};
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.observerInfrastructure, false);
        assert.equal(error.diagnostic.observerInfrastructure, false);
        assert.deepEqual(error.lastObservation, {denials: ['quorum_unmet']});
        return true;
      },
    );
  });

  it('Case C & D: recovery after product denial classifies observerInfrastructure: true ' +
    'only when remaining attempts could satisfy stablePolls', async () => {
    let n1 = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 4,
        stablePolls: 3,
        intervalMs: 0,
        sleep: noSleep,
        probe: async () => {
          n1 += 1;
          if (n1 === 1) return {ready: false, diagnostic: {denials: ['warming']}};
          if (n1 === 2) return {ready: true, diagnostic: {denials: []}};
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.observerInfrastructure, true);
        return true;
      },
    );

    let n2 = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-system-tables',
        attempts: 4,
        stablePolls: 3,
        intervalMs: 0,
        sleep: noSleep,
        probe: async () => {
          n2 += 1;
          if (n2 <= 2) return {ready: false, diagnostic: {denials: ['warming']}};
          if (n2 === 3) return {ready: true, diagnostic: {denials: []}};
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.observerInfrastructure, false);
        return true;
      },
    );
  });

  it('Case E & F: product-endpoint probe failure (curl: (7)) resets attribution to false, ' +
    'while SSH timeout expiring deadlineAtMs preserves observerInfrastructure: true', async () => {
    let n1 = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-node@10.0.0.1',
        attempts: 3,
        stablePolls: 3,
        intervalMs: 0,
        sleep: noSleep,
        probe: async () => {
          n1 += 1;
          if (n1 === 1) return {ready: true, diagnostic: {status: 200, json: {ready: true}}};
          if (n1 === 2) {
            throw new Error('curl: (7) Failed to connect to 10.0.0.1 port 8080');
          }
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.observerInfrastructure, false);
        assert.equal(error.productProbeFailureAttempts, 1);
        return true;
      },
    );

    let clockMs = 1000;
    let n2 = 0;
    await assert.rejects(
      pollReadiness({
        component: 'lagrange-node@10.0.0.1',
        attempts: 5,
        stablePolls: 3,
        intervalMs: 0,
        nowFn: () => clockMs,
        deadlineAtMs: 2000,
        sleep: noSleep,
        probe: async () => {
          n2 += 1;
          if (n2 === 1) return {ready: true, diagnostic: {status: 200, json: {ready: true}}};
          clockMs = 2500;
          throw new Error('ssh: connect to host 10.0.0.1 port 22: Connection timed out');
        },
      }),
      (error) => {
        assert.equal(error.deadlineExpired, true);
        assert.equal(error.observerInfrastructure, true);
        return true;
      },
    );
  });

  it('Case G: typedReadiness respects explicit observerInfrastructure and hadProductDenial',
    async () => {
      await assert.rejects(
        typedReadiness('tidb-sql-readiness', async () => {
          const err = new Error('TiDB SQL readiness timed out');
          err.deadlineExpired = true;
          err.observerInfrastructure = true;
          throw err;
        }),
        (error) => error.observerInfrastructure === true && error.deadlineExpired === true,
      );

      await assert.rejects(
        typedReadiness('tidb-sql-readiness', async () => {
          const err = new Error(
            'TiDB SQL readiness failed: exit=0 stdout="0"; ' +
            'diagnostics=[{"inspectError":"Cannot connect to the Docker daemon"}]',
          );
          err.hadProductDenial = true;
          throw err;
        }),
        (error) => error.observerInfrastructure === false,
      );
    });
});

describe('deployment contract window & option helpers', () => {
  it('exports canonical deadlines and resolves operation windows & tri-state signal options',
    () => {
      assert.equal(DEFAULT_LAGRANGE_FORMATION_DEADLINE_MS, 420_000);
      assert.equal(DEFAULT_LAGRANGE_ROUTABLE_DEADLINE_MS, 900_000);
      assert.equal(DEFAULT_LAGRANGE_OBSERVE_ROLES_DEADLINE_MS, 15_000);
      assert.equal(DEFAULT_TIDB_FORMATION_DEADLINE_MS, 240_000);
      assert.equal(DEFAULT_TIDB_PLACEMENT_DEADLINE_MS, 120_000);
      assert.equal(DEFAULT_TIDB_OBSERVE_ROLES_DEADLINE_MS, 30_000);
      assert.equal(DEFAULT_POSTGRES_FORMATION_DEADLINE_MS, 240_000);
      assert.equal(DEFAULT_POSTGRES_OBSERVATION_DEADLINE_MS, 30_000);
      assert.equal(DEFAULT_POST_FAILURE_DIAGNOSTIC_DEADLINE_MS, 30_000);

      const stripped = stripTransientExecutionOptions({
        lagrangeImage: 'img',
        signal: new AbortController().signal,
        deadlineAtMs: 123,
        deadlineMs: 456,
        timeoutMs: 789,
      });
      assert.deepEqual(stripped, {lagrangeImage: 'img'});

      assert.deepEqual(withExplicitSignalOption({a: 1, signal: 'old'}, undefined), {
        a: 1,
        signal: 'old',
      });
      assert.deepEqual(withExplicitSignalOption({a: 1, signal: 'old'}, null), {
        a: 1,
        signal: null,
      });

      const win = resolveOperationWindow({
        clock: () => 500_000,
        defaultDeadlineMs: 900_000,
        callerDeadlineAtMs: 600_000,
      });
      assert.deepEqual(win, {
        signal: null,
        startedAtMs: 500_000,
        deadlineAtMs: 600_000,
        deadlineMs: 100_000,
      });
    });
});
