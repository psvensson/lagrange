// The single B1 call site: B1's load-generator CLI runs from a checkout at the
// harness commit; its answer is mapped into stream A's fields; refusals,
// non-executions, a foreign endpoint, a plan off the manifest, an unverified
// dataset and a product setup failure are typed; the load generator is never
// a product host. Substituted: B1's runner (its record shape) and ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
  prepareLoadGeneratorCheckout,
} from '../comparative-benchmark-workload-call-site.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  arrayFind,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';

const MANIFEST = buildComparativeCampaignManifest({campaignId: 'bench-x',
  profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange', 'tidb-tikv']});
const RUN = MANIFEST.runs[0];
const IMAGE = `sha256:${'a'.repeat(64)}`;
// The load generator's checkout already holds the harness commit (the
// presence probe answers exit 0); listed last so a combined command never matches it first.
const COMMIT_PRESENT = [/git cat-file -e/u, '\n__exit_code=0'];

function deployment() {
  return {roles: [{role: 'n', host: '10.0.0.1', containerId: 'c1'}],
    endpoint: {protocol: 'postgresql', host: '10.0.0.1', port: 5433, containerId: 'c1'},
    access: {connection: {user: 'u', password: 'p', database: 'd'}},
    identity: {products: [{containerId: 'c1', imageId: IMAGE}]},
    operations: {observePlacement: async () => ({replicasByPartition: []})}};
}

function b1Record(overrides = {}) {
  return {recordKind: 'benchmark-workload-run',
    dispatch: {status: 'executed'},
    identity: {harness: {driverSourceSha256: 'feed', adapterIds: ['lagrange-pgwire']}},
    plan: {datasetDigest: MANIFEST.plan.datasetDigest.slice(7), profileClass: 'smoke',
      operationSliceDigest: 'slice', plannedOperationCounts: {payment: 2},
      workloadProfileId: 'scenario-a-smoke-v1'},
    deployment: {endpoint: {host: '10.0.0.1', port: 5433}, dataset: {
      resetMethod: 'fresh-formation', verification: {status: 'verified',
        method: 'm', observedLogicalChecksum: 'k', expectedLogicalChecksum: 'k',
        expectedTableRows: {item: 3}, observedTableRows: {item: 3}}}},
    observations: {runStatus: 'completed', requests: []},
    correctness: {semanticGate: null, finalState: null},
    loadGenerator: {nodeVersion: 'v22.23.2', nativeClients: {pg: '8.18.0', mysql2: '3.24.4'},
      checkout: {gitCommit: 'abc'}},
    ...overrides};
}

function executor(record, extra = {}) {
  const seen = [];
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.9',
    runWorkload: async (request) => {
      seen.push(request);
      return typeof record === 'function' ? record() : record;
    },
    describeLoadGenerator: async () => ({hostname: 'lg', bootId: 'b'}), ...extra});
  return {seen, execute: () => run({run: RUN, manifest: MANIFEST, deployment: deployment()})};
}

test('a completed B1 run maps into stream A fields', async () => {
  const {seen, execute} = executor(b1Record());
  const result = await execute();
  assert.equal(seen[0].system, 'lagrange');
  assert.equal(seen[0].subkind, 'smoke');
  assert.deepEqual(seen[0].connection, {endpoint: {host: '10.0.0.1', port: 5433},
    credentials: {user: 'u', password: 'p', database: 'd'}});
  assert.equal(result.failure, null);
  assert.equal(result.productFailure, null);
  assert.deepEqual(result.plan.plannedOperationCounts, {payment: 2});
  assert.equal(result.dataset.verification.status, 'verified');
  assert.deepEqual(result.endpoint, {host: '10.0.0.1', port: 5433});
  assert.equal(result.plan.workloadProfileId, 'scenario-a-smoke-v1');
  assert.deepEqual(result.harness, {driverSourceSha256: 'feed', adapterIds: ['lagrange-pgwire']});
  assert.equal(seen[0].subkind, 'smoke');
  assert.equal(result.loadGenerator.nodeVersion, 'v22.23.2');
  assert.deepEqual(result.loadGenerator.driverVersions, {pg: '8.18.0', mysql2: '3.24.4'});
  assert.equal(result.correctness.semanticGate, null);
});

test('the semantic gate record from the gate stage lands in correctness', async () => {
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.9',
    runWorkload: async () => b1Record(), describeLoadGenerator: async () => ({})});
  const gate = {status: 'passed', passed: ['p'], failed: [], missing: []};
  const result = await run({run: RUN, manifest: MANIFEST, deployment: deployment(),
    semanticGate: gate});
  assert.equal(result.correctness.semanticGate, gate);
});

test('a product setup failure (SQLSTATE 55P03) is a product failure with a complete record',
  async () => {
    const {execute} = executor(b1Record({observations: {runStatus: 'setup-failed',
      setup: {sqlstate: '55P03'}, requests: []}, deployment: {endpoint:
      {host: '10.0.0.1', port: 5433}, dataset: {resetMethod: 'fresh-formation',
      verification: {status: 'unobserved'}}}}));
    const result = await execute();
    assert.deepEqual(result.productFailure, {runStatus: 'setup-failed',
      setup: {sqlstate: '55P03'}});
    assert.equal(result.failure, null);
  });

test('refusals, non-executions, foreign endpoints, plan drift and unverified data are typed',
  async () => {
    const cases = [
      [{recordKind: 'benchmark-dispatch-refused', reason: 'no family', dispatch: {}},
        'benchmark_dispatch_refused', true],
      [b1Record({dispatch: {status: 'blocked', reason: 'x'}}), 'workload_not_executed', true],
      [b1Record({deployment: {endpoint: {host: '10.9.9.9', port: 5433}}}),
        'endpoint_unbound', false],
      [b1Record({plan: {...b1Record().plan, datasetDigest: 'other'}}), 'plan_mismatch', false],
      [b1Record({deployment: {endpoint: {host: '10.0.0.1', port: 5433}, dataset: {
        resetMethod: 'fresh-formation', verification: {status: 'mismatch'}}}}),
      'dataset_unverified', false],
    ];
    for (const [record, code, throws] of cases) {
      const {execute} = executor(record);
      if (throws) {
        await assert.rejects(execute(), (error) => error.code === code, code);
      } else {
        assert.equal((await execute()).failure.code, code);
      }
    }
  });

test('a load generator on a product host is refused before the workload runs', async () => {
  let called = false;
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.1', runWorkload: async () => {
    called = true;
  }, describeLoadGenerator: async () => ({})});
  await assert.rejects(run({run: RUN, manifest: MANIFEST, deployment: deployment()}),
    (error) => error.code === 'load_generator_colocated');
  assert.equal(called, false);
});

test('the remote runner refuses a checkout off the harness commit and runs the B1 CLI',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const stale = createScriptedSsh([[/git rev-parse HEAD/u, 'deadbeef']]);
    await assert.rejects(createRemoteWorkloadRunner({sshRun: stale.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'})({}, RUN),
    (error) => error.code === 'load_generator_commit_mismatch');
    const good = createScriptedSsh([[/git rev-parse HEAD/u, 'abc'],
      [/run-benchmark-workload\.js/u, '\n__exit_code=0'],
      [/tail -n 1/u, JSON.stringify(b1Record())]]);
    const record = await createRemoteWorkloadRunner({sshRun: good.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'})({system: 'lagrange'}, RUN);
    assert.equal(record.dispatch.status, 'executed');
    const cli = arrayFind(good.calls, (call) => stringIncludes(call.command, 'run-benchmark'));
    assert.match(cli.command, /--manifest 'test-output\/bench\/bench-x\/[^']+\/request\.json'/u);
  });

test('an exhausted deployment is run unopened: the request names the setup failure and ' +
  'no connection, and B1\'s unissued record is the product failure', async () => {
  const setupFailure = {failureClass: 'product_error', sqlState: null,
    code: 'readiness_exhausted', message: 'membership 1 of 3'};
  const seen = [];
  const execute = createWorkloadRunExecutor({clientHost: '10.0.0.9',
    runWorkload: async (request) => {
      seen.push(request);
      return b1Record({deployment: {endpoint: null, dataset: {resetMethod: 'fresh-formation',
        verification: {status: 'failed', failure: setupFailure}}},
      observations: {runStatus: 'setup-failed', setup: setupFailure,
        requests: [{outcome: 'unissued'}]}});
    },
    describeLoadGenerator: async () => ({hostname: 'lg', bootId: 'b'})});
  const exhausted = {...deployment(), endpoint: null, access: undefined, operations: undefined};
  const result = await execute({run: RUN, manifest: MANIFEST, deployment: exhausted,
    semanticGate: null, setupFailure});
  assert.deepEqual(seen[0].setupFailure, setupFailure);
  assert.equal(Object.hasOwn(seen[0], 'connection'), false);
  assert.equal(result.failure, null);
  assert.deepEqual(result.productFailure, {runStatus: 'setup-failed', setup: setupFailure});
  assert.equal(result.endpoint, null);
  assert.equal(result.placement, null);
  assert.equal(result.observations.requests[0].outcome, 'unissued');
});

// A lab host's shared checkout is at whatever commit it was last provisioned
// with (and may carry local edits): the load generator never moves it. The
// campaign runs the CLI from a throwaway detached worktree of that checkout at
// the harness commit, which the checkout must already hold (never fetched), and
// removes it after.
test('the load generator runs from a worktree at the harness commit, never the shared checkout',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const ssh = createScriptedSsh([[/git worktree add/u, 'abc'],
      [/run-benchmark-workload\.js/u, '\n__exit_code=0'],
      [/tail -n 1/u, JSON.stringify(b1Record())],
      [/git rev-parse HEAD/u, 'abc'], COMMIT_PRESENT]);
    const checkout = await prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'});
    const worktree = '/srv/lagrange/test-output/bench-worktrees/bench-x';
    assert.equal(checkout.host.repoPath, worktree);
    assert.equal(host.repoPath, '/srv/lagrange');
    assert.match(ssh.calls[0].command, /^cd '\/srv\/lagrange' && git cat-file -e 'abc\^\{commit\}'/u);
    assert.equal(arraySome(ssh.calls, (call) => stringIncludes(call.command, 'fetch')), false);
    const add = ssh.calls[1].command;
    assert.match(add, /^cd '\/srv\/lagrange' && /u);
    assert.match(add, /git worktree add --detach --quiet '\/srv\/lagrange\/test-output\/bench-worktrees\/bench-x' 'abc'/u);
    assert.match(add, /ln -s '\/srv\/lagrange\/node_modules' '\/srv\/lagrange\/test-output\/bench-worktrees\/bench-x\/node_modules'/u);
    await createRemoteWorkloadRunner({sshRun: ssh.sshRun, opts: {}, host: checkout.host,
      harnessCommit: 'abc', campaignId: 'bench-x'})({system: 'lagrange'}, RUN);
    const cli = arrayFind(ssh.calls, (call) => stringIncludes(call.command, 'run-benchmark'));
    assert.match(cli.command, /^cd '\/srv\/lagrange\/test-output\/bench-worktrees\/bench-x' && /u);
    await checkout.release();
    const removal = ssh.calls[ssh.calls.length - 1].command;
    assert.match(removal, /git worktree remove --force '\/srv\/lagrange\/test-output\/bench-worktrees\/bench-x'/u);
  });

test('a worktree that is not at the harness commit refuses the campaign', async () => {
  const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
  const ssh = createScriptedSsh([[/git worktree add/u, 'deadbeef'], COMMIT_PRESENT]);
  await assert.rejects(prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
    harnessCommit: 'abc', campaignId: 'bench-x'}),
  (error) => error.code === 'load_generator_commit_mismatch');
  assert.match(ssh.calls[ssh.calls.length - 1].command, /git worktree remove --force/u);
});

// Live campaign bench-live-20261101-b-r4: the TiDB arm's load generator exited
// 1 and the failure carried only its (empty) stdout - the CLI writes its error
// to stderr, which the ssh seam does not return. The CLI's stderr is kept in
// the run directory and its tail is part of the typed failure.
test('a load generator that exits non-zero reports its stderr', async () => {
  const host = {ip: '10.0.0.9', repoPath: '/srv/wt', nodePath: '/usr/bin/node',
    driverInstall: {status: 'installed', exitCode: 0, output: ''}};
  const ssh = createScriptedSsh([[/git rev-parse HEAD/u, 'abc'],
    [/run-benchmark-workload\.js/u, '\n__exit_code=1'],
    [/tail -n \d+ '[^']*stderr\.log'/u, 'run-benchmark-workload: Error: boom at x.js:1']]);
  await assert.rejects(createRemoteWorkloadRunner({sshRun: ssh.sshRun, opts: {}, host,
    harnessCommit: 'abc', campaignId: 'bench-x'})({system: 'tidb-tikv'}, RUN),
  (error) => error.code === 'workload_failed' &&
    /boom at x\.js:1/u.test(error.diagnostic.stderr) && /exited 1/u.test(error.message));
  const cli = arrayFind(ssh.calls, (call) => stringIncludes(call.command, 'run-benchmark'));
  assert.match(cli.command, / 2> 'test-output\/bench\/bench-x\/[^']+\/stderr\.log'/u);
});

// Coordinator decision 3: the load generator's worktree installs the
// reference-client package (mysql2) from its own lockfile with the host's
// npm; a failed install refuses only the TiDB arm, typed.
test('the load-generator worktree installs the reference-client drivers; a failed install ' +
  'refuses only the TiDB arm', async () => {
  const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange',
    nodePath: '/opt/node/v22/bin/node'};
  const installed = createScriptedSsh([[/git worktree add/u, 'abc'],
    [/npm ci/u, '\n__exit_code=0'], COMMIT_PRESENT]);
  const ok = await prepareLoadGeneratorCheckout({sshRun: installed.sshRun, opts: {}, host,
    harnessCommit: 'abc', campaignId: 'bench-x'});
  const install = arrayFind(installed.calls, (call) => stringIncludes(call.command, 'npm ci'));
  assert.match(install.command, /cd '\/srv\/lagrange\/test-output\/bench-worktrees\/bench-x'/u);
  assert.match(install.command, /PATH='\/opt\/node\/v22\/bin':"\$PATH" npm ci --offline --prefix test\/distributed\/reference-client --ignore-scripts/u);
  assert.equal(ok.host.driverInstall.status, 'installed');
  const failed = createScriptedSsh([[/git worktree add/u, 'abc'],
    [/npm ci/u, 'npm ERR! network\n__exit_code=1'],
    [/git rev-parse HEAD/u, 'abc'],
    [/run-benchmark-workload\.js/u, '\n__exit_code=0'],
    [/tail -n 1 /u, JSON.stringify(b1Record())], COMMIT_PRESENT]);
  const prepared = await prepareLoadGeneratorCheckout({sshRun: failed.sshRun, opts: {}, host,
    harnessCommit: 'abc', campaignId: 'bench-x'});
  assert.equal(prepared.host.driverInstall.status, 'failed');
  assert.match(prepared.host.driverInstall.output, /npm ERR! network/u);
  const runner = createRemoteWorkloadRunner({sshRun: failed.sshRun, opts: {},
    host: prepared.host, harnessCommit: 'abc', campaignId: 'bench-x'});
  await assert.rejects(runner({system: 'tidb-tikv'}, RUN),
    (error) => error.code === 'load_generator_driver_missing' &&
      /npm ERR! network/u.test(error.diagnostic.output));
  const record = await runner({system: 'postgresql'}, RUN);
  assert.equal(record.dispatch.status, 'executed');
});

// The load generator's checkout must already hold the harness commit: an absent
// commit is a typed refusal naming the host, checkout and commit. Nothing is
// fetched from any remote and no worktree is created (owner rule: no fallback).
test('a load-generator checkout without the harness commit refuses, typed, and never fetches',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const ssh = createScriptedSsh([
      [/git cat-file -e/u, 'fatal: Not a valid object name abc^{commit}\n__exit_code=128']]);
    await assert.rejects(prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'}), (error) => {
      assert.equal(error.code, 'load_generator_commit_absent');
      assert.match(error.message, /10\.0\.0\.9/u);
      assert.match(error.message, /\/srv\/lagrange/u);
      assert.match(error.message, /abc/u);
      assert.equal(error.diagnostic.harnessCommit, 'abc');
      assert.equal(error.diagnostic.repoPath, '/srv/lagrange');
      return true;
    });
    assert.equal(arraySome(ssh.calls, (call) => stringIncludes(call.command, 'fetch')), false);
    assert.equal(arraySome(ssh.calls, (call) => stringIncludes(call.command, 'worktree add')),
      false);
  });

// Decision D2 (2026-11-14): the reference client installs offline only, from
// the host's npm cache; a tarball missing from that cache refuses the TiDB arm
// and names the tarball. No online install is attempted.
test('the reference-client install is offline only; a tarball missing from the cache is named',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const url = 'https://registry.npmjs.org/@types/node/-/node-22.20.2.tgz';
    const ssh = createScriptedSsh([[/git worktree add/u, 'abc'],
      [/npm ci/u, 'npm error code ENOTCACHED\nnpm error request to ' + url +
        ' failed: cache mode is \'only-if-cached\' but no cached response is available.\n' +
        '__exit_code=1'], COMMIT_PRESENT]);
    const prepared = await prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'});
    const install = arrayFind(ssh.calls, (call) => stringIncludes(call.command, 'npm ci'));
    assert.match(install.command, / npm ci --offline /u);
    assert.deepEqual(prepared.host.driverInstall.missing, [url]);
    await assert.rejects(createRemoteWorkloadRunner({sshRun: ssh.sshRun, opts: {},
      host: prepared.host, harnessCommit: 'abc', campaignId: 'bench-x'})({system: 'tidb-tikv'}, RUN),
    (error) => error.code === 'load_generator_driver_missing' &&
      error.diagnostic.reason === 'offline_cache_incomplete' &&
      stringIncludes(error.message, url));
  });

test('a worktree removal that fails is recorded as an incomplete closure, never swallowed',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const ssh = createScriptedSsh([[/git worktree add/u, 'abc'],
      [/git worktree remove/u, new Error('worktree locked')], COMMIT_PRESENT]);
    const checkout = await prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'});
    const closure = await checkout.release();
    assert.equal(closure.status, 'incomplete');
    assert.match(closure.error, /worktree locked/u);
  });

test('a failed checkout preparation keeps its cause and records the cleanup it attempted',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const ssh = createScriptedSsh([[/git worktree add/u, new Error('worktree add failed')],
      [/git worktree remove/u, new Error('no such worktree')], COMMIT_PRESENT]);
    await assert.rejects(prepareLoadGeneratorCheckout({sshRun: ssh.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'}), (error) => {
      assert.match(error.message, /worktree add failed/u);
      assert.equal(error.loadGeneratorWorktree.status, 'incomplete');
      assert.match(error.loadGeneratorWorktree.error, /no such worktree/u);
      return true;
    });
  });

// Independent verification N5: the TiDB arm needs the reference-client
// drivers the worktree installed; a host without an install record is not
// known to have them and refuses it too, fail-closed.
test('a TiDB run on a load generator with no driver-install record is refused', async () => {
  const host = {ip: '10.0.0.9', repoPath: '/srv/wt', nodePath: '/usr/bin/node'};
  const ssh = createScriptedSsh([[/git rev-parse HEAD/u, 'abc'],
    [/run-benchmark-workload\.js/u, '\n__exit_code=0'],
    [/tail -n 1 /u, JSON.stringify(b1Record())]]);
  const runner = createRemoteWorkloadRunner({sshRun: ssh.sshRun, opts: {}, host,
    harnessCommit: 'abc', campaignId: 'bench-x'});
  await assert.rejects(runner({system: 'tidb-tikv'}, RUN),
    (error) => error.code === 'load_generator_driver_missing' &&
      error.diagnostic.reason === 'install_not_recorded');
  assert.equal(arraySome(ssh.calls, (call) => stringIncludes(call.command, 'run-benchmark')),
    false);
});
