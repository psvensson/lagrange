import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import process from 'node:process';
import {describe, it} from 'node:test';

import {readinessDenialOf} from '../benchmark-readiness-denial.js';
import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {runComparativeCampaign} from '../comparative-benchmark-campaign-runner.js';
import {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
} from '../comparative-benchmark-workload-call-site.js';
import {
  arrayFilter,
  arrayIncludes,
  arrayMap,
  arraySome,
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
  isDeploymentFailure,
  resolveOperationWindow,
  stripTransientExecutionOptions,
  withExplicitSignalOption,
} from '../real-product-deployment-contract.js';
import {
  inspectProducts,
  observeProductsAfterWindow,
} from '../real-product-identity.js';
import {pollReadiness, typedReadiness} from '../real-product-readiness.js';
import {
  classifyRemoteCommandError,
  createInFlightTracker,
  createRemoteDockerProvider,
  createSshCommandRunner,
  createTrackedSshRun,
  errorText,
  httpFromHost,
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

const E2E_IMAGE_ID = `sha256:${'a'.repeat(64)}`;
const E2E_LAYER_ID = `sha256:${'c'.repeat(64)}`;
const E2E_MANIFEST = buildComparativeCampaignManifest({
  campaignId: 'camp-e2e-native',
  profile: COMPARATIVE_SMOKE_PROFILE,
  targets: ['lagrange'],
});
const E2E_SINGLE_RUN_MANIFEST = Object.freeze({
  ...E2E_MANIFEST,
  runs: [E2E_MANIFEST.runs[0]],
});
const E2E_HEADER = Object.freeze({
  executionTarget: 'lab',
  physicalHosts: [{
    hostId: '10.0.0.1',
    ip: '10.0.0.1',
    hostname: '10.0.0.1',
    bootId: 'boot-1',
    cpus: 8,
    memGb: 16,
  }],
  harness: {gitCommit: 'f'.repeat(40), driverSourceSha256: null, adapterIds: []},
});

function buildHealthyWorkloadRecordJson() {
  return JSON.stringify({
    recordKind: 'benchmark-workload-record',
    dispatch: {status: 'executed'},
    observations: {accounting: {offered: 1, issued: 1, unissued: 0}},
    correctness: {},
    plan: {
      datasetDigest: E2E_MANIFEST.plan.datasetDigest,
      profileClass: 'smoke',
      operationSliceDigest: 'sha256:slice',
      plannedOperationCounts: {payment: 1},
    },
    deployment: {
      endpoint: {host: '10.0.0.1', port: 5432},
      dataset: {resetMethod: 'fresh-formation', verification: {status: 'verified'}},
    },
    identity: {harness: {driverSourceSha256: 'feed', adapterIds: ['lagrange']}},
    loadGenerator: {
      hostname: 'node-client',
      nodeVersion: 'v22.0.0',
      nativeClients: {},
      checkout: {commit: 'f'.repeat(40), clean: true},
    },
  });
}

function buildHealthyContainerInspectJson() {
  return JSON.stringify({
    Id: 'c1',
    Name: '/bench-camp-e2e-native-node-1',
    Image: E2E_IMAGE_ID,
    Config: {Image: 'img:1', Entrypoint: ['lagrange'], Cmd: []},
    State: {
      Running: true,
      Status: 'running',
      StartedAt: '2026-11-01T10:00:00Z',
      FinishedAt: '0001-01-01T00:00:00Z',
      ExitCode: 0,
      OOMKilled: false,
      RestartCount: 0,
    },
    Mounts: [],
    RestartCount: 0,
  });
}

function buildHealthyImageInspectJson() {
  return JSON.stringify({
    Id: E2E_IMAGE_ID,
    RepoDigests: ['img@sha256:1'],
    RootFS: {Type: 'layers', Layers: [E2E_LAYER_ID]},
    Config: {Labels: {}},
    Created: '2026-11-01T09:00:00Z',
  });
}

function createNativeChildRouterExecFile(resolveScriptForCommand) {
  return (_file, args, options, callback) => {
    const target = args[args.length - 2];
    const command = args[args.length - 1];
    const childJs = resolveScriptForCommand({target, command, options});
    return execFile(process.execPath, ['-e', childJs], options, callback);
  };
}

function buildBaseDeployment(products) {
  return {
    targetId: 'lagrange',
    runClass: 'smoke',
    roles: [{role: 'node', host: '10.0.0.1', containerId: 'c1'}],
    endpoint: {host: '10.0.0.1', port: 5432, containerId: 'c1'},
    access: {
      endpoint: {host: '10.0.0.1', port: 5432, protocol: 'pg-wire'},
      connection: {user: 'postgres', database: 'lagrange'},
    },
    storage: [],
    hosts: ['10.0.0.1'],
    readiness: {state: 'ready'},
    placement: null,
    identity: {products},
  };
}

function createNativeCampaignHarness({
  sshRun,
  defaultTimeoutMs = 2000,
  deadlineAt = null,
  now = () => 1000,
  deployRunOverride = null,
} = {}) {
  const records = [];
  const workloadRunner = createRemoteWorkloadRunner({
    sshRun,
    opts: {},
    host: {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'},
    harnessCommit: 'f'.repeat(40),
    campaignId: E2E_MANIFEST.campaignId,
    now,
    workloadTimeoutMs: defaultTimeoutMs,
  });
  const executeWorkloadRun = createWorkloadRunExecutor({
    clientHost: '10.0.0.9',
    describeLoadGenerator: async () => ({
      hostname: 'node-client',
      nodeVersion: 'v22.0.0',
      nativeClients: {},
      checkout: {commit: 'f'.repeat(40), clean: true},
    }),
    runWorkload: workloadRunner,
  });
  const inspectInitial = async () => {
    const inspected = await inspectProducts({
      sshRun,
      opts: {},
      roles: [{
        role: 'node',
        host: '10.0.0.1',
        containerId: 'c1',
      }],
    });
    return arrayMap(inspected, (product) => ({...product, reportedVersion: '1.0.0'}));
  };
  const deps = {
    now,
    deadlineAt,
    recordOwner: {
      validateCampaignHeader: (header) => header,
      validateRunRecord: (record) => record,
      computeRunObservationsDigest: () => `sha256:${'d'.repeat(64)}`,
    },
    deployRun: deployRunOverride || (async () => {
      const products = await inspectInitial();
      return buildBaseDeployment(products);
    }),
    executeWorkloadRun,
    inspectProducts: async (dep, callOpts = {}) => observeProductsAfterWindow({
      sshRun,
      opts: callOpts,
      products: dep.identity.products,
    }),
    teardownRun: async () => ({
      complete: true,
      removed: [{host: '10.0.0.1', containerIds: ['c1']}],
      unclosed: [],
    }),
    appendRecords: async (lines) => records.push(...lines),
  };
  return {deps, records, inspectInitial};
}

function defaultHealthyChildScript(command) {
  if (stringIncludes(command, 'docker inspect --type container')) {
    return `process.stdout.write(${JSON.stringify(buildHealthyContainerInspectJson())});`;
  }
  if (stringIncludes(command, 'docker image inspect')) {
    return `process.stdout.write(${JSON.stringify(buildHealthyImageInspectJson())});`;
  }
  if (stringIncludes(command, 'docker info')) {
    return 'process.stdout.write(\'[["driver-type","io.containerd.snapshotter.v1"]]\');';
  }
  if (stringIncludes(command, 'git rev-parse HEAD')) {
    return `process.stdout.write("${'f'.repeat(40)}\\n");`;
  }
  if (stringIncludes(command, '--manifest')) {
    return 'process.stdout.write("\\n__exit_code=0\\n");';
  }
  if (stringIncludes(command, 'records.ndjson')) {
    return `process.stdout.write(${JSON.stringify(buildHealthyWorkloadRecordJson())});`;
  }
  return 'process.stdout.write("ok\\n");';
}

describe('End-to-end native child-process -> SSH wrapper -> adapter -> campaign matrix', () => {
  it('1) Healthy product fixture through real child process completes cleanly', async () => {
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) =>
        defaultHealthyChildScript(command)),
      defaultTimeoutMs: 2000,
    });
    const {deps, records} = createNativeCampaignHarness({sshRun});
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(records.length, 2);
    assert.equal(runRecord.execution.state, 'completed');
    assert.equal(runRecord.failureClass, undefined);
    assert.equal(Boolean(runRecord.timedOut), false);
    assert.equal(Boolean(runRecord.execution.timedOut), false);
    assert.equal(runRecord.execution.failure, null);
    assert.equal(runRecord.identity.productsAfterWindow.length, 1);
  });

  it('2) Native exit 1 + explicit Docker missing-container output produces container_absent ' +
    'events and product_changed in final campaign record', async () => {
    let containerInspectCalls = 0;
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) => {
        if (stringIncludes(command, 'docker inspect --type container')) {
          containerInspectCalls += 1;
          if (containerInspectCalls >= 2) {
            return 'process.stderr.write("Error: No such container: c1\\n"); process.exit(1);';
          }
        }
        return defaultHealthyChildScript(command);
      }),
      defaultTimeoutMs: 2000,
    });

    // Direct observeProductsAfterWindow check + full campaign check:
    const before = await inspectProducts({
      sshRun,
      opts: {},
      roles: [{
        role: 'node',
        host: '10.0.0.1',
        containerId: 'c1',
        version: async () => '1.0.0',
      }],
    });
    const observed = await observeProductsAfterWindow({
      sshRun,
      opts: {},
      products: before,
    });
    assert.equal(observed.length, 0);

    containerInspectCalls = 0;
    const {deps} = createNativeCampaignHarness({sshRun});
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'failed');
    assert.equal(runRecord.execution.failure.code, 'product_changed');
    const absentEvents = arrayFilter(
      runRecord.harnessEvents,
      (e) => e.kind === 'container-absent',
    );
    assert.equal(absentEvents.length, 1);
    assert.equal(absentEvents[0].containerId, 'c1');
  });

  it('3) Native exit 1 + permission error fails inspection as identity_unverified without ' +
    'inventing container_absent', async () => {
    let containerInspectCalls = 0;
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) => {
        if (stringIncludes(command, 'docker inspect --type container')) {
          containerInspectCalls += 1;
          if (containerInspectCalls >= 2) {
            return 'process.stderr.write("permission denied while trying to connect to the ' +
              'Docker daemon socket at unix:///var/run/docker.sock\\n"); process.exit(1);';
          }
        }
        return defaultHealthyChildScript(command);
      }),
      defaultTimeoutMs: 2000,
    });

    const {deps} = createNativeCampaignHarness({sshRun});
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'failed');
    assert.equal(runRecord.execution.failure.code, 'identity_unverified');
    assert.equal(runRecord.execution.failure.exitCode, 1);
    assert.equal(
      arraySome(runRecord.harnessEvents, (e) => e.kind === 'container-absent'),
      false,
    );
  });

  it('4) Native SSH exit 255 classifies as infrastructure_error and never container_absent',
    async () => {
      let containerInspectCalls = 0;
      const sshRun = createSshCommandRunner({
        execFileImpl: createNativeChildRouterExecFile(({command}) => {
          if (stringIncludes(command, 'docker inspect --type container')) {
            containerInspectCalls += 1;
            if (containerInspectCalls >= 2) {
              return 'process.stderr.write("ssh: connect to host 10.0.0.1 port 22: ' +
                'No route to host (No such container)\\n"); process.exit(255);';
            }
          }
          return defaultHealthyChildScript(command);
        }),
        defaultTimeoutMs: 2000,
      });

      const {deps} = createNativeCampaignHarness({sshRun});
      const summary = await runComparativeCampaign({
        manifest: E2E_SINGLE_RUN_MANIFEST,
        header: E2E_HEADER,
        deps,
      });
      const runRecord = summary.records[0];
      assert.equal(runRecord.execution.state, 'failed');
      assert.equal(runRecord.failureClass, 'infrastructure_error');
      assert.equal(runRecord.execution.failure.code, 'identity_unverified');
      assert.equal(runRecord.execution.failure.exitCode, 255);
      assert.equal(runRecord.execution.failure.observerInfrastructure, true);
      assert.equal(
        arraySome(runRecord.harnessEvents, (e) => e.kind === 'container-absent'),
        false,
      );
    });

  it('5) Native workload timeout ({code: null, signal: SIGTERM, killed: true}) before ' +
    'campaign watchdog records timedOut: true and infrastructure_error in final campaign record',
  async () => {
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) => {
        if (stringIncludes(command, '--manifest')) {
          return 'setTimeout(() => {}, 10000);';
        }
        return defaultHealthyChildScript(command);
      }),
      defaultTimeoutMs: 60,
    });

    const {deps} = createNativeCampaignHarness({
      sshRun,
      defaultTimeoutMs: 60,
      deadlineAt: 1_000_000,
    });
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'failed');
    assert.equal(runRecord.failureClass, 'infrastructure_error');
    assert.equal(runRecord.timedOut, true);
    assert.equal(runRecord.execution.timedOut, true);
    assert.equal(runRecord.execution.failure.code, 'workload_failed');
    assert.equal(runRecord.execution.failure.timedOut, true);
    assert.equal(runRecord.execution.failure.killed, true);
    assert.equal(runRecord.execution.failure.signal, 'SIGTERM');
    assert.equal(runRecord.execution.failure.transportError, true);
    assert.equal(runRecord.execution.failure.observerInfrastructure, true);
  });

  it('6) Workload timeout followed by clean child exit (exit 0 or 143 on SIGTERM) still ' +
    'records timedOut: true and infrastructure_error in final campaign record', async () => {
    for (const trapExitCode of [0, 143]) {
      const sshRun = createSshCommandRunner({
        execFileImpl: createNativeChildRouterExecFile(({command}) => {
          if (stringIncludes(command, '--manifest')) {
            return `process.on("SIGTERM", () => process.exit(${trapExitCode})); ` +
              'setTimeout(() => {}, 10000);';
          }
          return defaultHealthyChildScript(command);
        }),
        defaultTimeoutMs: 60,
      });

      const {deps} = createNativeCampaignHarness({
        sshRun,
        defaultTimeoutMs: 60,
        deadlineAt: 1_000_000,
      });
      const summary = await runComparativeCampaign({
        manifest: E2E_SINGLE_RUN_MANIFEST,
        header: E2E_HEADER,
        deps,
      });
      const runRecord = summary.records[0];
      assert.equal(runRecord.execution.state, 'failed');
      assert.equal(runRecord.failureClass, 'infrastructure_error');
      assert.equal(runRecord.timedOut, true);
      assert.equal(runRecord.execution.timedOut, true);
      assert.equal(runRecord.execution.failure.code, 'workload_failed');
      assert.equal(runRecord.execution.failure.timedOut, true);
      assert.equal(runRecord.execution.failure.exitCode, trapExitCode);
      assert.equal(runRecord.execution.failure.observerInfrastructure, true);
    }
  });

  it('7) Campaign signal abort during native child workload execution records state and ' +
    'failureClass as interrupted with watchdog_stopped', async () => {
    let clock = 1000;
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) => {
        if (stringIncludes(command, '--manifest')) {
          clock = 2000;
          return 'setTimeout(() => {}, 10000);';
        }
        return defaultHealthyChildScript(command);
      }),
      defaultTimeoutMs: 5000,
    });

    const {deps} = createNativeCampaignHarness({
      sshRun,
      defaultTimeoutMs: 5000,
      deadlineAt: 1030,
      now: () => clock,
    });
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'interrupted');
    assert.equal(runRecord.failureClass, 'interrupted');
    assert.equal(runRecord.execution.failure.code, 'watchdog_stopped');
    assert.equal(Boolean(runRecord.timedOut), false);
  });

  it('8) Bounded curl --max-time exit 28 through native child process classifies as ' +
    'httpTimedOut: true, timedOut: false, observerInfrastructure: false, and product_error',
  async () => {
    const sshRun = createSshCommandRunner({
      execFileImpl: createNativeChildRouterExecFile(({command}) => {
        if (stringIncludes(command, 'curl ')) {
          return 'process.stderr.write("curl: (28) Operation timed out after 1000 ' +
            'milliseconds with 0 bytes received\\n"); process.exit(28);';
        }
        return defaultHealthyChildScript(command);
      }),
      defaultTimeoutMs: 5000,
    });

    const probeRes = await httpFromHost({
      sshRun,
      opts: {},
      from: '10.0.0.9',
      url: 'http://10.0.0.1:8080/readyz',
      timeoutMs: 500,
    });
    assert.equal(probeRes.status, null);
    assert.equal(probeRes.exitCode, 28);
    assert.equal(probeRes.httpTimedOut, true);
    assert.equal(probeRes.timedOut, false);
    assert.equal(probeRes.transportError, true);
    assert.equal(probeRes.observerInfrastructure, false);

    const {deps, inspectInitial} = createNativeCampaignHarness({
      sshRun,
      deployRunOverride: async () => {
        const products = await inspectInitial();
        return {
          ...buildBaseDeployment(products),
          operations: {
            observePlacement: async () => pollReadiness({
              component: 'lagrange-node@10.0.0.1',
              attempts: 2,
              stablePolls: 1,
              intervalMs: 0,
              sleep: async () => {},
              probe: async () => {
                const res = await httpFromHost({
                  sshRun,
                  opts: {},
                  from: '10.0.0.9',
                  url: 'http://10.0.0.1:8080/readyz',
                  timeoutMs: 500,
                });
                if (res.status !== 200) {
                  return {ready: false, diagnostic: res};
                }
                return {ready: true, diagnostic: res};
              },
            }),
          },
        };
      },
    });
    const summary = await runComparativeCampaign({
      manifest: E2E_SINGLE_RUN_MANIFEST,
      header: E2E_HEADER,
      deps,
    });
    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'product-failure');
    assert.equal(runRecord.failureClass, 'product_error');
    assert.equal(runRecord.execution.failure.code, 'readiness_exhausted');
    assert.equal(Boolean(runRecord.execution.failure.observerInfrastructure), false);
    assert.equal(Boolean(runRecord.timedOut), false);
    assert.equal(isDeploymentFailure({code: 1}), false);
    assert.equal(isDeploymentFailure({code: 28}), false);
    assert.equal(isDeploymentFailure({code: 'ENOENT', syscall: 'spawn ssh'}), false);
    assert.equal(isDeploymentFailure({name: 'AbortError', code: 'ABORT_ERR'}), false);
    assert.equal(isDeploymentFailure({code: 'workload_failed'}), true);
  });
});
