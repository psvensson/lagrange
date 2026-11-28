// Stages 2 and 3 of the quest scenario-a-research-substrate-ladder: the research profile class
// and its barriers, the record validator's treatment of the timeline, catalog
// and custody fields, and the golden witness that the smoke profile stays
// byte-identical (its manifest and plan digests are those of the retained
// physical record, which admission recomputes).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';

import {ADMISSION_REASON, admitClaim} from '../benchmark-claim-admission.js';
import {describeBenchmarkWorkloadIdentity} from '../benchmark-scenario-a-run.js';
import {
  COMPARATIVE_RESEARCH_PROFILE,
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
  researchProfileWithFormationWait,
  researchReadinessBudget,
} from '../comparative-benchmark-campaign-manifest.js';
import {
  beginDeploymentRoundTrip,
  campaignEvidenceDirOf,
  createCampaignRecordWriter,
  runComparativeCampaign,
} from '../comparative-benchmark-campaign-runner.js';
import {
  buildObservedFaultEvidence,
  splitRestartReadiness,
} from '../comparative-benchmark-semantic-gate.js';
import {productCommitProvenance, localRevisionSourceFingerprint} from
  '../comparative-benchmark-revision-source.js';
import {verifyProductIdentity} from '../real-product-identity.js';
import {collectHostFacts} from '../comparative-benchmark-host-preparation.js';
import {createWorkloadRunExecutor} from '../comparative-benchmark-workload-call-site.js';
import {SUBSTRATE_KIND} from '../raw-observation-research-fields.js';
import {collectContainerLogs, removeCampaignContainers} from '../real-product-campaign-cleanup.js';
import {
  deployLagrangeCluster,
  planLagrangeNodePlacement,
} from '../real-product-deployer-lagrange.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  http,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  measureRoundTripMatrix,
  measureRtt,
  nodeNamespaceShell,
} from '../real-product-network-impairment.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {researchTopologyProblem, runCustodyCampaign} from './oltp-research-substrate-ladder-witnesses.js';
import {validateRunRecord} from '../raw-observation-record.js';
import {recomputeComparativeBenchmarks} from
  '../../../../scripts/checks/comparative-benchmark-recompute.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFind = Function.call.bind(Array.prototype.find);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySlice = Function.call.bind(Array.prototype.slice);
const stringTrim = Function.call.bind(String.prototype.trim);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..',
  '..');
const RETAINED = path.join(REPO_ROOT, 'solve/quests/physical-scenario-a-review-repair/' +
  'evidence/bench-oltp-1b0-three-2354/raw-observations.ndjson');
const CLI = path.join(REPO_ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');
const RESEARCH = 'research';
const RETAINED_CAMPAIGN = 'bench-oltp-1b0-three-2354';
const STORE_DIR = 'data/tidb-comparison';
const STORE = `${STORE_DIR}/raw-observations.ndjson`;
const RESEARCH_PROFILE_ID = 'scenario-a-research-v1';

function retainedRecords() {
  return arrayMap(arrayFilter(stringSplit(fs.readFileSync(RETAINED, 'utf8'), '\n'), Boolean),
    (line) => JSON.parse(line));
}

function researchRun(campaignId = 'bench-research-t') {
  return buildFixtureRun({campaignId, targetId: 'lagrange', subkind: RESEARCH,
    profileClass: RESEARCH, workloadProfileId: RESEARCH_PROFILE_ID});
}

describe('the smoke profile stays byte-identical', () => {
  it('rebuilds the retained campaign manifest exactly', () => {
    const header = arrayFind(retainedRecords(), (record) => record.recordType === 'campaign-header');
    const manifest = buildComparativeCampaignManifest({campaignId: RETAINED_CAMPAIGN,
      profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange']});
    assert.equal(manifest.manifestDigest, header.manifest.manifestDigest);
    assert.deepEqual(JSON.parse(JSON.stringify(manifest)), header.manifest);
  });

  it('derives the retained dataset, plan, measurement and slice digests', () => {
    const run = arrayFind(retainedRecords(), (record) => record.recordType === 'run');
    const identity = describeBenchmarkWorkloadIdentity(run.plan.workload);
    for (const field of ['datasetDigest', 'workloadPlanDigest', 'measurementPlanDigest',
      'operationSliceDigest']) {
      assert.equal(identity[field], run.plan[field], field);
    }
  });
});

describe('the research class', () => {
  it('builds a frozen, non-comparable manifest of the research family', () => {
    const manifest = buildComparativeCampaignManifest({campaignId: 'bench-research-t',
      profile: COMPARATIVE_RESEARCH_PROFILE, targets: ['lagrange']});
    assert.equal(manifest.comparable, false);
    assert.equal(manifest.plan.profileClass, RESEARCH);
    assert.equal(manifest.plan.workloadProfileId, RESEARCH_PROFILE_ID);
    assert.ok(arrayEvery(manifest.runs, (run) => run.subkind === RESEARCH));
    assert.ok(Object.isFrozen(manifest));
  });

  it('is a valid record under the one validator and refused by admission with the reason ' +
    'among the others', () => {
    const run = researchRun();
    validateRunRecord(run);
    const claim = {claimKey: 'lagrange/scenarioA/research', targetId: 'lagrange',
      scenario: 'scenarioA', subkind: RESEARCH, claimKind: 'throughput', minDistinctHosts: 3,
      forensicReceiptIds: [], declared: null};
    const campaignHeaders = new Map([[run.campaignId,
      buildFixtureHeader({campaignId: run.campaignId, targetIds: ['lagrange']})]]);
    const cell = admitClaim({claim, runs: [{file: 'x', run}], campaignHeaders,
      retainedReferences: [], invalidations: []});
    assert.ok(arrayIncludes(cell.reasons, ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE));
    assert.equal(cell.metrics, null);
    const broken = {...run, observations: {...run.observations, runStatus: 'no-such-status'}};
    const brokenCell = admitClaim({claim, runs: [{file: 'x', run: broken}], campaignHeaders,
      retainedReferences: [], invalidations: []});
    assert.ok(arrayIncludes(brokenCell.reasons,
      ADMISSION_REASON.RESEARCH_PROFILE_NOT_ADMISSIBLE));
  });

  it('reaches the existing comparative rules: three hosts, distinct machines, a load ' +
    'generator that is not a product host', async () => {
    assert.equal(await researchTopologyProblem(), null);
  });

  it('is refused by the writer for every spelling of the published store', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-writer-'));
    try {
      for (const file of [STORE, `${STORE_DIR}/forensic/x.ndjson`, `${STORE_DIR}/../${
        path.basename(STORE_DIR)}/raw-observations.ndjson`, path.join(root, STORE)]) {
        assert.throws(() => createCampaignRecordWriter({rootDir: root, file,
          profileClass: RESEARCH}), {code: 'refused_research_store_is_published_store'}, file);
      }
      createCampaignRecordWriter({rootDir: root, file: STORE, profileClass: 'smoke'});
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('fails the recompute check when the published store carries a research record', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-recompute-'));
    try {
      fs.cpSync(path.join(REPO_ROOT, STORE_DIR), path.join(root, STORE_DIR), {recursive: true});
      fs.cpSync(path.join(REPO_ROOT, 'docs/benchmarks'), path.join(root, 'docs/benchmarks'),
        {recursive: true});
      fs.appendFileSync(path.join(root, STORE), `${JSON.stringify(researchRun())}\n`);
      const result = await recomputeComparativeBenchmarks(root);
      assert.equal(result.ok, false);
      assert.match(result.difference, /^published store carries a research-class record/u);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('the one record validator and the new fields', () => {
  function timelineRun(timeline, catalog = ['BEGIN', 'COMMIT']) {
    const run = buildFixtureRun({campaignId: 'bench-timeline', subkind: 'main'});
    run.observations.statementCatalog = catalog;
    run.observations.requests[0].attempts[0].timeline = timeline;
    return sealFixtureRun(run);
  }

  it('accepts a record without a timeline (earlier campaigns) and one with it', () => {
    validateRunRecord(buildFixtureRun({campaignId: 'bench-timeline', subkind: 'main'}));
    validateRunRecord(timelineRun([[0, 1, 2, 'ok'], [1, 3, 4, 'ok']]));
  });

  it('rejects a timeline entry outside the catalog, ending early or malformed', () => {
    assert.throws(() => validateRunRecord(timelineRun([[2, 1, 2, 'ok']])), /catalog/u);
    assert.throws(() => validateRunRecord(timelineRun([[0, 5, 2, 'ok']])), /ends early/u);
    assert.throws(() => validateRunRecord(timelineRun([[0, 1, 2]])), /index, start, end/u);
  });

  it('checks the custody digest against the response evidence digest', () => {
    const run = buildFixtureRun({campaignId: 'bench-custody', subkind: 'main'});
    const evidence = run.observations.requests[0].responseEvidence ??
      {encoding: 'retained-file', sha256: 'a'.repeat(64), bytes: 3};
    run.observations.requests[0].responseEvidence = {...evidence,
      custody: {path: 'r/a.json', sha256: evidence.sha256, bytes: 3}};
    validateRunRecord(sealFixtureRun(run));
    run.observations.requests[0].responseEvidence.custody.sha256 = 'b'.repeat(64);
    assert.throws(() => validateRunRecord(sealFixtureRun(run)), /custody/u);
  });
});

describe('the runner CLI', () => {
  const GCP_ARGS = ['--execution-target', 'gcp', '--hosts',
    '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.9', '--targets', 'lagrange', '--profile', RESEARCH,
    '--campaign-id', 'bench-research-dry', '--dry-run', '--lagrange-image',
    'lagrange:0.0.0'];

  function cli(args) {
    return spawnSync(process.execPath, [CLI, ...args], {cwd: REPO_ROOT, encoding: 'utf8'});
  }

  it('prints the frozen plan, that nothing is admissible and the research store', () => {
    const result = cli([...GCP_ARGS, '--storage-root', '/srv/research']);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.manifest.plan.profileClass, RESEARCH);
    assert.equal(plan.admission.note, 'research: not admissible, published store refused');
    assert.equal(plan.rawObservationsPath,
      'test-output/research-sessions/bench-research-dry/raw-observations.ndjson');
  });

  it('refuses a research campaign without --storage-root', () => {
    const result = cli(GCP_ARGS);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--storage-root/u);
  });

  it('refuses a research campaign aimed at the published store', () => {
    const result = cli([...GCP_ARGS, '--storage-root', '/srv/research', '--raw-observations',
      STORE]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refused_research_store_is_published_store/u);
  });
});

describe('stage 3: the substrate ladder, the round trip and the campaign network', () => {
  const PING_BUSYBOX = ['PING 10.0.0.2 (10.0.0.2): 56 data bytes',
    '64 bytes from 10.0.0.2: seq=0 ttl=64 time=0.100 ms',
    '64 bytes from 10.0.0.2: seq=1 ttl=64 time=0.300 ms', '',
    '--- 10.0.0.2 ping statistics ---',
    '2 packets transmitted, 2 packets received, 0% packet loss',
    'round-trip min/avg/max = 0.100/0.200/0.300 ms'].join('\n');

  it('keeps custody files out of the published store for a comparative campaign', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-evidence-'));
    try {
      fs.mkdirSync(path.join(root, STORE_DIR), {recursive: true});
      const dir = campaignEvidenceDirOf({rootDir: root, profileClass: 'smoke',
        rawObservationsPath: STORE, campaignId: 'bench-comparative-t'});
      assert.equal(path.relative(root, dir), path.join('test-output/bench', 'bench-comparative-t'));
      const record = await runCustodyCampaign(dir);
      assert.ok(arraySome(record.observations.requests, (request) =>
        request.responseEvidence?.custody));
      assert.deepEqual(fs.readdirSync(path.join(root, STORE_DIR)), []);
      const research = campaignEvidenceDirOf({rootDir: root, profileClass: RESEARCH,
        rawObservationsPath: 'test-output/research-sessions/s/raw-observations.ndjson',
        campaignId: 's'});
      assert.equal(path.relative(root, research), 'test-output/research-sessions/s');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('measures the round trip with the iputils and the busybox ping', async () => {
    const iputils = await measureRtt({from: 'a', to: 'b', opts: {}, sshRun: async (_h, _o, command) => {
      assert.match(command, /ping -c 20 /u);
      return '20 packets transmitted, 19 received, 5% packet loss, time 19030ms\n' +
        'rtt min/avg/max/mdev = 0.210/0.350/0.980/0.120 ms\n';
    }});
    assert.deepEqual([iputils.transmitted, iputils.received, iputils.lossPercent, iputils.mdevMs],
      [20, 19, 5, 0.12]);
    const busybox = await measureRtt({from: 'a', to: 'b', opts: {}, sshRun: async () => PING_BUSYBOX});
    assert.deepEqual([busybox.minMs, busybox.avgMs, busybox.maxMs, busybox.mdevMs],
      [0.1, 0.2, 0.3, 0.1]);
    await assert.rejects(measureRtt({from: 'a', to: 'b', opts: {}, sshRun: async () => 'nothing'}),
      /no ping summary/u);
  });

  it('runs the node pairs of the first look from a helper container in the node namespace',
    async () => {
      const commands = [];
      const containers = {n1: 'c1', n2: 'c2', n3: 'c3'};
      const matrix = await measureRoundTripMatrix({dataHosts: ['n1', 'n2', 'n3'],
        loadGenerator: 'lg', endpointHost: 'n1', opts: {},
        sshRun: async (host, _opts, command) => {
          commands.push([host, command]);
          return PING_BUSYBOX;
        },
        shellOf: (address) => nodeNamespaceShell({campaignId: 'bench-rt',
          image: 'postgres:17-alpine', host: 'dockerhost', containerId: containers[address]})});
      assert.equal(matrix.entries.length, 7);
      assert.deepEqual(commands[0], ['dockerhost', 'docker run --rm --label ' +
        'lagrange.bench.campaign=bench-rt --network container:c1 --pull=never ' +
        'postgres:17-alpine ping -c 20 n2']);
      assert.ok(arrayEvery(arraySlice(commands, 0, 6), ([host, command]) =>
        host === 'dockerhost' && /^docker run --rm .*--network container:c\d .* ping -c 20 n\d$/u
          .test(command)));
      assert.deepEqual(commands[6], ['lg', 'ping -c 20 n1']);
    });

  it('accepts one machine only for the first look and keeps the rule for the rest', async () => {
    const hosts = [{ip: '10.0.0.5', name: 'a'}, {ip: '10.0.0.5', name: 'a'}];
    const sshRun = async () => 'lab-a|boot-1|12|15.0|eth0';
    await assert.rejects(collectHostFacts({hosts, sshRun, opts: {}}), /same machine/u);
    await assert.rejects(collectHostFacts({hosts, sshRun, opts: {},
      substrate: SUBSTRATE_KIND.MULTI_HOST}), /same machine/u);
    assert.equal((await collectHostFacts({hosts, sshRun, opts: {},
      substrate: SUBSTRATE_KIND.SINGLE_HOST})).length, 2);
    let n = 0;
    await assert.rejects(collectHostFacts({hosts, opts: {}, substrate: SUBSTRATE_KIND.SINGLE_HOST,
      sshRun: async () => `lab-a|boot-${n++}|12|15.0|eth0`}), /more than one machine/u);
  });

  it('plans one node per host unchanged and the first look on a campaign bridge', () => {
    const multi = planLagrangeNodePlacement({hosts: ['h1', 'h2', 'h3'], campaignId: 'bench-p'});
    assert.equal(multi.declaredHostCount, 3);
    assert.equal(multi.declaredHostIdentity, 'observed');
    assert.deepEqual(arrayMap(multi.nodes, (node) => node.declaredHostId), [null, null, null]);
    assert.equal(multi.network, null);
    assert.deepEqual(arrayMap(multi.nodes, (node) => node.nodeAddress), ['h1', 'h2', 'h3']);
    const single = planLagrangeNodePlacement({hosts: ['h', 'h', 'h'], campaignId: 'bench-p',
      substrate: SUBSTRATE_KIND.SINGLE_HOST});
    assert.equal(single.declaredHostCount, 3);
    assert.equal(single.declaredHostIdentity, 'synthetic');
    assert.deepEqual(arrayMap(single.nodes, (node) => node.declaredHostId),
      ['bench-p-synthetic-host-1', 'bench-p-synthetic-host-2', 'bench-p-synthetic-host-3']);
    assert.equal(single.network.name, 'bench-bench-p-net');
    assert.deepEqual(arrayMap(single.nodes, (node) => node.nodeAddress),
      ['bench-bench-p-lagrange-node-1', 'bench-bench-p-lagrange-node-2',
        'bench-bench-p-lagrange-node-3']);
    assert.throws(() => planLagrangeNodePlacement({hosts: ['h', 'h', 'h'], campaignId: 'bench-p'}),
      {code: 'refused_node_placement'});
    assert.throws(() => planLagrangeNodePlacement({hosts: ['h1', 'h2', 'h3'], campaignId: 'bench-p',
      substrate: SUBSTRATE_KIND.SINGLE_HOST}), {code: 'refused_node_placement'});
  });

  it('closes the campaign network with its containers, and reports a left one', async () => {
    const answers = (networks) => async (_host, _opts, command) => {
      if (/docker ps/u.test(command)) return '';
      if (/docker network ls/u.test(command)) return networks.shift() ?? '';
      return '';
    };
    const closed = await removeCampaignContainers({hosts: ['h', 'h'], campaignId: 'bench-n',
      opts: {}, campaignNetwork: true, sshRun: answers(['net1\n', ''])});
    assert.equal(closed.complete, true);
    const left = await removeCampaignContainers({hosts: ['h'], campaignId: 'bench-n', opts: {},
      campaignNetwork: true, sshRun: answers(['net1\n', 'net1\n'])});
    assert.equal(left.complete, false);
    assert.deepEqual(left.unclosed[0].networkIds, ['net1']);
    const untouched = [];
    await removeCampaignContainers({hosts: ['h'], campaignId: 'bench-n', opts: {},
      sshRun: async (_h, _o, command) => {
        untouched.push(command);
        return '';
      }});
    assert.ok(arrayEvery(untouched, (command) => !/network/u.test(command)));
  });

  it('lets only the first look put the load generator on a product host', async () => {
    const manifest = buildComparativeCampaignManifest({campaignId: 'bench-c',
      profile: COMPARATIVE_RESEARCH_PROFILE, targets: ['lagrange']});
    const run = manifest.runs[0];
    const deployment = {roles: [{host: '10.0.0.5'}]};
    const executor = (colocationAllowed) => createWorkloadRunExecutor({colocationAllowed,
      runWorkload: async () => {
        throw new Error('stop');
      }, describeLoadGenerator: async () => ({}), clientHost: '10.0.0.5'});
    await assert.rejects(executor(false)({run, manifest, deployment}),
      {code: 'load_generator_colocated'});
    await assert.rejects(executor(true)({run, manifest, deployment}),
      (error) => error.code !== 'load_generator_colocated');
  });
});

describe('stage 3: the first look deploys three nodes on one host on a campaign bridge', () => {
  it('creates the labelled network, starts every node on it by name and reads its address',
    async () => {
      const {sshRun, calls} = createScriptedSsh([
        [/^hostname/u, 'lab-a'],
        [/docker run -d/u, (command) => {
          const ordinal = /lagrange-node-(\d)/u.exec(command)[1];
          return `${ordinal}`.repeat(12);
        }],
        [/docker inspect -f/u, (command) => `172.30.0.${/(\d)\1{11}/u.exec(command)[1]}`],
      ]);
      const error = await deployLagrangeCluster({hosts: ['10.0.0.5', '10.0.0.5', '10.0.0.5'],
        clientIp: '10.0.0.5', sshRun, campaignId: 'camp-first',
        opts: {lagrangeImage: 'lagrange:0.4.0', substrate: SUBSTRATE_KIND.SINGLE_HOST,
          readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50,
            pollIntervalMs: 1}},
        sleep: async () => {}}).then(() => null, (failure) => failure);
      assert.equal(error?.code, 'readiness_exhausted');
      const commands = arrayMap(calls, (call) => call.command);
      assert.ok(arraySome(commands, (command) => command ===
        'docker network create --label lagrange.bench.campaign=camp-first bench-camp-first-net'));
      const runs = arrayFilter(commands, (command) => /^docker run -d/u.test(command));
      assert.equal(runs.length, 3);
      assert.ok(arrayEvery(runs, (command) => /--network bench-camp-first-net/u.test(command) &&
        !/--network host/u.test(command)));
      const seed = runs[0];
      assert.match(seed, /NODE_HOST_ID=camp-first-synthetic-host-1\b/u);
      assert.match(seed, /FORMATION_DECLARED_HOST_COUNT=3/u);
      assert.match(seed, /NODE_ADDRESS=bench-camp-first-lagrange-node-1:8080/u);
      for (const [index, joiner] of arraySlice(runs, 1).entries()) {
        assert.match(joiner, new RegExp(`NODE_HOST_ID=camp-first-synthetic-host-${index + 2}\\b`, 'u'));
        assert.match(joiner, /SEED_NODE_ADDRESS=bench-camp-first-lagrange-node-1:8080/u);
        assert.doesNotMatch(joiner, /FORMATION_DECLARED_HOST_COUNT/u);
      }
      assert.match(error.message, /lagrange-node@172\.30\.0\.1 /u);
      assert.ok(arrayEvery(error.roles, (role) => role.host === '10.0.0.5' &&
        role.machineHostName === 'lab-a' && role.declaredHostIdentity === 'synthetic'));
      assert.deepEqual(arrayMap(error.roles, (role) => role.address).sort(),
        ['172.30.0.1', '172.30.0.2', '172.30.0.3']);
    });
});

describe('stage 3b: a node address is never stale after a restart', () => {
  const BRIDGE_HOSTS = ['172.30.0.1', '172.30.0.2', '172.30.0.3'];
  const NODE_ONE = '00000000-0000-4000-8000-000000000001';

  it('observes every node address again before the next probe and moves the endpoint with its node',
    async () => {
      const ledger = createContainerLedger();
      const addressOf = new Map();
      const inspectedAddress = (command) => {
        const id = /(\d{1}[0-9a-f]{11,63}|[0-9a-f]{12,64})'?$/u.exec(command)[1];
        return addressOf.get(id) ?? '';
      };
      const {sshRun, calls} = createScriptedSsh([
        [/docker inspect -f '\{\{\(index \.NetworkSettings\.Networks/u, inspectedAddress],
        // The moved node answers its control snapshot at its new address.
        [/\/\/172\.30\.0\.99:8081\/api\/admin\/control-snapshot/u, http(200, {nodeId: NODE_ONE,
          replicaOperations: {inFlightCount: 0}, controlPlaneDiagnostics: {readinessByNodeId: {
            [NODE_ONE]: {dimensions: {serveEligible: true}, reasons: []}}}})],
        ...lagrangeHealthyRules(ledger, {hosts: BRIDGE_HOSTS})]);
      const originalSsh = sshRun;
      let started = 0;
      const rememberAddresses = async (host, opts, command, timeout) => {
        const answer = await originalSsh(host, opts, command, timeout);
        if (/^docker run -d/u.test(command)) {
          started += 1;
          const id = stringTrim(String(answer));
          addressOf.set(id, BRIDGE_HOSTS[started - 1]);
        }
        return answer;
      };
      const deployment = await deployLagrangeCluster({hosts: ['10.0.0.5', '10.0.0.5', '10.0.0.5'],
        clientIp: '10.0.0.5', sshRun: rememberAddresses, campaignId: 'camp-restart',
        opts: {lagrangeImage: LAGRANGE_IMAGE, substrate: SUBSTRATE_KIND.SINGLE_HOST,
          readiness: {stablePolls: 1, attempts: 3, intervalMs: 0, timeoutMs: 50,
            pollIntervalMs: 1}}, sleep: async () => {}});
      const listener = arrayFind(deployment.roles, (role) => role.role === 'sys-postgres-wire');
      assert.equal(deployment.endpoint.host, listener.address);
      const nodeRole = arrayFind(deployment.roles, (role) => role.containerId ===
        deployment.endpoint.containerId && role.role === 'lagrange-node');
      addressOf.set(nodeRole.containerId, '172.30.0.99');
      const before = calls.length;
      const ready = await deployment.operations.awaitReady({});
      assert.deepEqual(ready.addressChanges, [{containerId: nodeRole.containerId,
        before: BRIDGE_HOSTS[0], after: '172.30.0.99'}]);
      assert.equal(deployment.endpoint.host, '172.30.0.99');
      assert.ok(arrayEvery(arrayFilter(deployment.roles, (role) => role.containerId ===
        nodeRole.containerId), (role) => role.address === '172.30.0.99'));
      assert.match(calls[before].command, /^docker inspect -f /u,
        'the addresses are observed before the first probe');
    });
});

describe('stage 3c: the declared formation wait, the round trip at deployment, the node logs', () => {
  const MATRIX = {startedAt: '2026-11-28T10:00:00.000Z', endedAt: '2026-11-28T10:00:05.000Z',
    entries: []};
  const LOGS = {nodeLogs: [{containerId: 'c1', role: 'lagrange-node', host: 'h',
    path: 'r/node-logs/lagrange-node-c1.log', bytes: 3, sha256: 'a'.repeat(64)}]};

  it('carries the wait in the plan of a research run only, with the budget the readiness ' +
    'owner takes', () => {
    const manifest = buildComparativeCampaignManifest({campaignId: 'bench-w',
      profile: researchProfileWithFormationWait(900), targets: ['lagrange']});
    assert.equal(manifest.plan.formationWaitSeconds, 900);
    assert.deepEqual(researchReadinessBudget(900), {formationDeadlineMs: 900000, attempts: 900});
    assert.equal(researchReadinessBudget(60).attempts, 120);
    assert.throws(() => researchProfileWithFormationWait(1801));
    const smoke = buildComparativeCampaignManifest({campaignId: 'bench-w',
      profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange']});
    assert.equal(Object.hasOwn(smoke.plan, 'formationWaitSeconds'), false);
  });

  it('takes --formation-wait-seconds for a research campaign and refuses it elsewhere', () => {
    const run = (extra, profile = RESEARCH) => spawnSync(process.execPath, [CLI, '--execution-target',
      'gcp', '--hosts', '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.9', '--targets', 'lagrange', '--profile',
      profile, '--campaign-id', 'bench-research-w', '--dry-run', '--lagrange-image', 'lagrange:0.0.0',
      ...extra], {cwd: REPO_ROOT, encoding: 'utf8'});
    const ok = run(['--storage-root', '/srv/r', '--formation-wait-seconds', '900']);
    assert.equal(ok.status, 0, ok.stderr);
    const plan = JSON.parse(ok.stdout);
    assert.equal(plan.formationWaitSeconds, 900);
    assert.equal(plan.manifest.plan.formationWaitSeconds, 900);
    assert.notEqual(run(['--storage-root', '/srv/r', '--formation-wait-seconds', '1801']).status, 0);
    const smoke = run(['--formation-wait-seconds', '900'], 'smoke');
    assert.notEqual(smoke.status, 0);
    assert.match(smoke.stderr, /only for --profile research/u);
  });

  it('hands the started nodes to the caller before the readiness wait', async () => {
    const {sshRun, calls} = createScriptedSsh([
      [/^hostname/u, 'lab-a'],
      [/docker run -d/u, (command) => `${/lagrange-node-(\d)/u.exec(command)[1]}`.repeat(12)],
      [/docker inspect -f/u, (command) => `172.30.0.${/(\d)\1{11}/u.exec(command)[1]}`],
    ]);
    let atHook = null;
    await deployLagrangeCluster({hosts: ['10.0.0.5', '10.0.0.5', '10.0.0.5'], clientIp: '10.0.0.5',
      sshRun, campaignId: 'camp-hook', onNodesStarted: async ({roles}) => {
        atHook = {addresses: arrayMap(roles, (role) => role.address).sort(), calls: calls.length};
      },
      opts: {lagrangeImage: 'lagrange:0.4.0', substrate: SUBSTRATE_KIND.SINGLE_HOST,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50,
          pollIntervalMs: 1}}, sleep: async () => {}}).catch(() => null);
    assert.deepEqual(atHook.addresses, ['172.30.0.1', '172.30.0.2', '172.30.0.3']);
    assert.ok(arrayEvery(arraySlice(calls, 0, atHook.calls),
      (call) => !/\{\{json \.State\}\}/u.test(call.command)),
    'no readiness inspection ran before the hook');
  });

  function researchCampaign({failDeployment, unpinnable = false, bindFailure = false,
    gateStatus = null}) {
    const manifest = buildComparativeCampaignManifest({campaignId: 'bench-fail',
      profile: researchProfileWithFormationWait(900), targets: ['lagrange']});
    const order = [];
    const product = {role: 'lagrange-node', host: '10.0.0.5', containerId: 'c1',
      imageRef: 'img:1', imageId: `sha256:${'a'.repeat(64)}`, repoDigest: 'img@sha256:1',
      entrypoint: ['x'], cmd: [], startedAt: '2026-11-01T10:00:00Z', reportedVersion: '1',
      contentIdentity: `sha256:${'c'.repeat(64)}`, imageStore: 'containerd',
      provenance: 'registry:img@sha256:1'};
    const deployment = {targetId: 'lagrange', roles: [{role: 'lagrange-node', host: '10.0.0.5',
      address: '172.30.0.1', containerId: 'c1'}],
    endpoint: gateStatus ? {host: '172.30.0.1', port: 5432, containerId: 'c1'} : null, access: {}, storage: [],
    hosts: [], readiness: {state: 'exhausted'}, placement: null, identity: {products: [unpinnable ? {...product, contentIdentity: null} : product]}};
    let clock = 0;
    const deps = {now: () => clock, deadlineAt: null,
      recordOwner: {validateCampaignHeader: (header) => header,
        validateRunRecord: (record) => record, computeRunObservationsDigest: () => `sha256:${'d'.repeat(64)}`},
      deployRun: async () => {
        clock += 7000;
        if (bindFailure) {
          throw Object.assign(new Error('172.18.0.2:5432 is owned by 0 campaign containers'),
            {code: 'endpoint_unbound'});
        }
        if (failDeployment) {
          throw Object.assign(new Error('formation did not complete'),
            {code: 'readiness_exhausted', deployment});
        }
        return deployment;
      },
      executeWorkloadRun: async () => ({observations: {runStatus: 'setup-failed', requests: [],
        accounting: {offered: 0}}, correctness: {semanticGate: null}, plan: {},
      dataset: {resetMethod: 'not-performed'}, loadGenerator: {host: '10.0.0.9'},
      productFailure: {runStatus: 'setup-failed'}}),
      inspectProducts: async () => [product],
      teardownRun: async () => {
        order.push('teardown');
        return {complete: true, removed: [], unclosed: []};
      },
      appendRecords: async (lines) => order.push(...lines),
      ...(gateStatus ? {runSemanticGate: async ({deployment: staged}) => ({
        gate: {status: gateStatus}, deployment: staged, events: []})} : {}),
      measureRoundTrip: async () => MATRIX,
      deploymentRoundTrip: () => MATRIX,
      collectNodeLogs: async () => {
        order.push('logs');
        return LOGS;
      }};
    return {manifest, deps, order};
  }

  it('keeps the formation time, the round trip at deployment and the node logs of a failed ' +
    'formation, collected before teardown', async () => {
    const {manifest, deps, order} = researchCampaign({failDeployment: true});
    await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
      physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)}}});
    assert.ok(arrayIndexOf(order, 'logs') >= 0 &&
      arrayIndexOf(order, 'logs') < arrayIndexOf(order, 'teardown'));
    const record = arrayFind(order, (entry) => entry?.recordType === 'run');
    assert.equal(record.formation.declaredWaitSeconds, 900);
    assert.equal(record.formation.deadlineMs, 900000);
    assert.equal(record.formation.readyAfterMs, null);
    assert.deepEqual(record.observations.network.roundTrip.atDeployment, MATRIX);
    assert.deepEqual(record.diagnostics, LOGS);
  });

  for (const [title, options] of [
    ['product pinning', {unpinnable: true}],
    ['endpoint binding', {bindFailure: true}]]) {
    it(`leaves the raw record of a run whose ${title} failed after the formation`, async () => {
      const {manifest, deps, order} = researchCampaign(options);
      await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
        physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)}}});
      const header = arrayFind(order, (entry) => entry?.recordType === 'campaign-header');
      assert.deepEqual(header.products, []);
      assert.equal(header.unpinnedTargets.length, 1);
      const record = arrayFind(order, (entry) => entry?.recordType === 'run');
      assert.equal(record.formation.declaredWaitSeconds, 900);
      assert.deepEqual(record.observations.network.roundTrip.atDeployment, MATRIX);
      assert.deepEqual(record.diagnostics, LOGS);
    });
  }

  it('keeps the matrix, the formation time and the node logs of a run the semantic gate ' +
    'blocked', async () => {
    const {manifest, deps, order} = researchCampaign({gateStatus: 'failed'});
    await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
      physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)}}});
    const record = arrayFind(order, (entry) => entry?.recordType === 'run');
    assert.equal(record.execution.failure.code, 'refused_research_requires_passed_gate');
    assert.equal(record.formation.readyAfterMs, 7000);
    assert.deepEqual(record.observations.network.roundTrip.atDeployment, MATRIX);
    assert.deepEqual(record.diagnostics, LOGS);
    assert.ok(arrayFind(order, (entry) => entry?.recordType === 'campaign-header'));
  });

  it('judges a restart readiness without the observed address moves', () => {
    const awaited = {cluster: {state: 'ready'}, addressChanges: []};
    const deployment = {storage: [{containerId: 'c1', kind: 'host-volume', mount: '/data',
      source: '/srv/n1'}]};
    const product = (startedAt) => ({role: 'lagrange-node', containerId: 'c1', startedAt,
      mounts: [{type: 'bind', source: '/srv/n1', destination: '/data'}]});
    const evidenceOf = (readiness) => buildObservedFaultEvidence({deployment,
      target: {host: 'h', containerId: 'c1'}, beforeProduct: product('2026-11-28T10:00:00Z'),
      afterProduct: product('2026-11-28T10:05:00Z'), readiness});
    assert.deepEqual(evidenceOf(awaited).retainedObligations, [],
      'the unsplit object fails closed on the empty list');
    const {readiness, addressChanges} = splitRestartReadiness(awaited);
    assert.deepEqual(addressChanges, []);
    assert.equal(evidenceOf(readiness).retainedObligations.length > 0, true);
  });

  describe('a research plan declares the product source it tests', () => {
    const COMMIT = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO_ROOT, encoding: 'utf8'})
      .stdout.trim();
    const dry = (extra, profile = RESEARCH) => spawnSync(process.execPath, [CLI,
      '--execution-target', 'gcp', '--hosts', '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.9', '--targets',
      'lagrange', '--profile', profile, '--campaign-id', 'bench-research-p', '--dry-run',
      '--lagrange-image', 'lagrange:0.0.0', ...extra], {cwd: REPO_ROOT, encoding: 'utf8'});

    it('leaves the default plan without a product block', () => {
      const plan = JSON.parse(dry(['--storage-root', '/srv/r']).stdout);
      assert.equal(Object.hasOwn(plan.manifest.plan, 'product'), false);
      assert.equal(Object.hasOwn(plan, 'product'), false);
      assert.equal(plan.admission.note, 'research: not admissible, published store refused');
    });

    it('takes the expected fingerprint and version from the declared commit tree', () => {
      const expected = productCommitProvenance(REPO_ROOT, COMMIT);
      assert.equal(expected.sourceFingerprintExpected,
        localRevisionSourceFingerprint(REPO_ROOT, COMMIT));
      const out = dry(['--storage-root', '/srv/r', '--product-commit', COMMIT]);
      assert.equal(out.status, 0, out.stderr);
      const plan = JSON.parse(out.stdout);
      assert.deepEqual(plan.manifest.plan.product, {declaredCommit: COMMIT,
        sourceFingerprintExpected: expected.sourceFingerprintExpected});
      assert.match(plan.admission.note, /product commit differs from the harness commit is research only/u);
    });

    it('refuses the flag for another profile, with other expectation flags, and for an ' +
      'absent commit', () => {
      const other = dry(['--product-commit', COMMIT], 'smoke');
      assert.notEqual(other.status, 0);
      assert.match(other.stderr, /only for --profile research/u);
      const both = dry(['--storage-root', '/srv/r', '--product-commit', COMMIT,
        '--lagrange-version', '0.4.2']);
      assert.notEqual(both.status, 0);
      assert.match(both.stderr, /one source of the expected version/u);
      const absent = dry(['--storage-root', '/srv/r', '--product-commit', 'f'.repeat(40)]);
      assert.notEqual(absent.status, 0);
      assert.match(absent.stderr, /product_commit_absent/u);
    });

    it('still refuses a booted fingerprint that differs from the expected one', () => {
      const product = {role: 'lagrange-node', imageRef: 'img:1', contentIdentity: `sha256:${'c'.repeat(64)}`,
        imageId: `sha256:${'a'.repeat(64)}`, reportedVersion: '0.4.2',
        bootProvenance: {bootedSrcFingerprint: 'a'.repeat(16)}};
      const check = (expectedSrcFingerprint) => () => verifyProductIdentity([product],
        {'lagrange-node': {imageRef: 'img:1', contentIdentity: product.contentIdentity,
          versionPattern: /^0\.4\.2$/u,
          expectedSrcFingerprint}});
      assert.doesNotThrow(check('a'.repeat(16)));
      assert.throws(check('b'.repeat(16)), /does not match expected/u);
    });

    it('records the declared commit, the expected and booted fingerprints and the label', async () => {
      const {manifest, deps, order} = researchCampaign({failDeployment: true});
      const pinned = manifest.targets.length;
      assert.equal(pinned, 1);
      const labelled = (label) => {
        const {deployRun} = deps;
        deps.deployRun = async (...args) => {
          try {
            return await deployRun(...args);
          } catch (error) {
            error.deployment.identity.products[0] = {...error.deployment.identity.products[0],
              imageLabels: label === null ? {} : {'org.opencontainers.image.revision': label},
              bootProvenance: {bootedSrcFingerprint: 'e'.repeat(16)}};
            throw error;
          }
        };
      };
      labelled('c'.repeat(40));
      await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
        physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)},
        product: {declaredCommit: 'c'.repeat(40), harnessCommit: 'f'.repeat(40),
          sourceFingerprintExpected: 'e'.repeat(16)}}});
      const record = arrayFind(order, (entry) => entry?.recordType === 'run');
      assert.deepEqual(record.product, {declaredCommit: 'c'.repeat(40),
        harnessCommit: 'f'.repeat(40), sourceFingerprintExpected: 'e'.repeat(16),
        sourceFingerprintBooted: 'e'.repeat(16), revisionLabel: 'c'.repeat(40),
        revisionLabelAvailable: true});
      assert.equal(arrayFind(order, (entry) => entry?.recordType === 'campaign-header')
        .product.declaredCommit, 'c'.repeat(40));
    });

    it('records a label that is not a commit id as not available', async () => {
      const {manifest, deps, order} = researchCampaign({failDeployment: true});
      const {deployRun} = deps;
      deps.deployRun = async (...args) => {
        try {
          return await deployRun(...args);
        } catch (error) {
          error.deployment.identity.products[0].imageLabels = {
            'org.opencontainers.image.revision': 'unknown'};
          error.deployment.identity.products[0].bootProvenance = {bootedSrcFingerprint: 'e'};
          throw error;
        }
      };
      await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
        physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)},
        product: {declaredCommit: 'c'.repeat(40), harnessCommit: 'f'.repeat(40),
          sourceFingerprintExpected: 'e'}}});
      const record = arrayFind(order, (entry) => entry?.recordType === 'run');
      assert.equal(record.product.revisionLabel, null);
      assert.equal(record.product.revisionLabelAvailable, false);
    });
  });

  it('starts the readiness polls at once while a long matrix runs beside them', async () => {
    const MATRIX_MS = 400;
    const store = new Map();
    const scripted = createScriptedSsh([
      [/^hostname/u, 'lab-a'],
      [/docker run -d/u, (command) => `${/lagrange-node-(\d)/u.exec(command)[1]}`.repeat(12)],
      [/docker inspect -f/u, (command) => `172.30.0.${/(\d)\1{11}/u.exec(command)[1]}`],
    ]);
    let hookAt = null;
    let firstCallAfterHookAt = null;
    const sshRun = (...args) => {
      if (hookAt !== null && firstCallAfterHookAt === null) firstCallAfterHookAt = Date.now();
      return scripted.sshRun(...args);
    };
    await deployLagrangeCluster({hosts: ['10.0.0.5', '10.0.0.5', '10.0.0.5'],
      clientIp: '10.0.0.5', sshRun, campaignId: 'camp-beside',
      onNodesStarted: ({roles}) => {
        hookAt = Date.now();
        beginDeploymentRoundTrip(store, 'r1', async () => {
          const startedAt = new Date().toISOString();
          await new Promise((resolve) => setTimeout(resolve, MATRIX_MS));
          return {startedAt, endedAt: new Date().toISOString(), entries: [], roles};
        });
      },
      opts: {lagrangeImage: 'lagrange:0.4.0', substrate: SUBSTRATE_KIND.SINGLE_HOST,
        readiness: {stablePolls: 1, attempts: 2, intervalMs: 0, timeoutMs: 50,
          pollIntervalMs: 1}}, sleep: async () => {}}).catch(() => null);
    assert.ok(firstCallAfterHookAt - hookAt < MATRIX_MS / 2,
      'the first readiness probe does not wait for the matrix');
    const matrix = await store.get('r1');
    assert.ok(matrix.durationMs >= MATRIX_MS - 50);
  });

  it('states the formation clock and stages, ready below the matrix duration', async () => {
    const {manifest, deps, order} = researchCampaign({failDeployment: false});
    const {deployRun} = deps;
    deps.deployRun = async (...args) => ({...await deployRun(...args),
      formationTimes: {containersStartedAt: '2026-11-28T10:00:00.000Z',
        firstPollAt: '2026-11-28T10:00:00.050Z', pollIntervalMs: 1000,
        readyObservedAt: '2026-11-28T10:00:03.000Z'},
      readiness: {state: 'ready', observedAt: '2026-11-28T10:00:03.000Z', evidence: {
        nodes: [{component: 'lagrange-node@a', observedAt: '2026-11-28T10:00:01.000Z',
          timeToReadyMs: 900}],
        cluster: {component: 'lagrange-system-tables', observedAt: '2026-11-28T10:00:02.500Z',
          timeToReadyMs: 1500}}}});
    deps.deploymentRoundTrip = () => ({...MATRIX, durationMs: 138000});
    await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
      physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)}}}).catch(() => null);
    const {formation} = arrayFind(order, (entry) => entry?.recordType === 'run');
    assert.equal(formation.readyAfterMs, 3000);
    assert.ok(formation.readyAfterMs < 138000);
    assert.equal(formation.firstPollAt, '2026-11-28T10:00:00.050Z');
    assert.equal(formation.pollIntervalMs, 1000);
    assert.deepEqual(formation.stages.cluster, {component: 'lagrange-system-tables',
      observedAt: '2026-11-28T10:00:02.500Z', timeToReadyMs: 1500});
    assert.equal(formation.stages.nodes.timeToReadyMs, 900);
    assert.ok(arrayIndexOf(order, 'logs') >= 0, 'the logs of a run that formed are collected too');
  });

  it('runs the matrix beside the formation one probe at a time per source, sources at once', async () => {
    const active = new Map();
    let peak = 0;
    let overlapOfOneSource = false;
    const sshRun = async (host, opts, command) => {
      const source = /ping/u.test(command) ? /container:(n[\d.]+)/u.exec(command)?.[1] ?? host : host;
      if ((active.get(source) ?? 0) > 0) overlapOfOneSource = true;
      active.set(source, (active.get(source) ?? 0) + 1);
      peak = Math.max(peak, [...active.values()].filter((count) => count > 0).length);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active.set(source, active.get(source) - 1);
      return '20 packets transmitted, 20 received, 0% packet loss\n' +
        'rtt min/avg/max/mdev = 0.1/0.2/0.3/0.01 ms\n';
    };
    const hosts = ['172.30.0.1', '172.30.0.2', '172.30.0.3'];
    const matrix = await measureRoundTripMatrix({dataHosts: hosts, loadGenerator: '10.0.0.9',
      endpointHost: hosts[0], sshRun, opts: {}, parallel: true,
      shellOf: (address) => ({host: 'h',
        wrap: (argv) => `docker run --network container:n${address} ${argv.join(' ')}`})});
    assert.equal(matrix.entries.length, 7);
    assert.equal(overlapOfOneSource, false);
    assert.ok(peak >= 3, 'the sources run at once');
  });

  it('collects the whole log of a node, with the cap stated when it is reached', async () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-logs-'));
    const commands = [];
    const CAP = 48 * 1024 * 1024;
    const sshRun = async (host, opts, command) => {
      commands.push(command);
      if (/wc -c/u.test(command)) return `${CAP + 12345}\n`;
      return /ccc/u.test(command) ? 'x'.repeat(CAP) : 'short log\n';
    };
    const entries = await collectContainerLogs({runId: 'r1', evidenceDir, sshRun, opts: {},
      containers: [{host: 'h', containerId: 'a'.repeat(64), role: 'lagrange-node'},
        {host: 'h', containerId: 'ccc'.repeat(21), role: 'lagrange-node'}]});
    fs.rmSync(evidenceDir, {recursive: true, force: true});
    assert.ok(arrayEvery(commands, (command) => !/--tail/u.test(command)));
    assert.equal(entries[0].truncated, undefined);
    assert.deepEqual(entries[1].truncated,
      {capBytes: CAP, keptBytes: CAP, totalBytes: CAP + 12345});
  });

  it('states the measured time to ready of a run that formed', async () => {
    const {manifest, deps, order} = researchCampaign({failDeployment: false});
    await runComparativeCampaign({manifest, deps, header: {executionTarget: 'lab',
      physicalHosts: [], harness: {gitCommit: 'f'.repeat(40)}}}).catch(() => null);
    const record = arrayFind(order, (entry) => entry?.recordType === 'run');
    assert.equal(record.formation.readyAfterMs, 7000);
  });
});
