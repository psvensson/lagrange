/**
 * Census: every site that starts a Lagrange node declares its required host
 * identity (owner decision D3, 2026-11-17; src/topology/node-host-identity.js):
 * the chart (downward API spec.nodeName), the distributed Docker harness and
 * its configs (the provider machine's name), the GCP provisioner and the lab
 * harness (the VM and lab host names they write), the comparative deployer
 * (the name the data host answers), the embedded and in-process harnesses,
 * the examples, and every in-process node construction. A new start site that
 * omits it fails here, naming the file.
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {hostname, tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  NODE_HOST_ID_ERROR_CODE,
  requireDeclaredNodeHostId,
} from '../../src/topology/node-host-identity.js';
import {resolveProviderHostName} from
  '../distributed/harness/scenario-host-topology.js';
import {CLUSTER_STARTUP_GATE_LAYER} from
  '../distributed/harness/cluster-startup-gate-layer.js';
import {buildRemoteConfig} from '../../scripts/lab/harness.js';
import * as deployers from '../distributed/harness/real-product-cluster-deployers.js';
import {createScriptedSsh} from
  '../distributed/harness/__tests__/real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  dataHostName,
  lagrangeHealthyRules,
} from '../distributed/harness/__tests__/real-product-deployer-product-answers-fixture.js';
import {PROFILE, generateClusterSpec} from
  '../../examples/lab-cluster-smoke/cluster-config.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCANNED_ROOTS = ['src', 'test', 'scripts', 'examples', 'docs/benchmarks'];
const SCANNED_EXTENSIONS = ['.js', '.mjs'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'fixtures', '__fixtures__']);
const THIS_FILE = relative(ROOT, fileURLToPath(import.meta.url));

// In-process node construction: its options object must declare hostId.
const NODE_CONSTRUCTION =
  /new (BootstrapService|NodeJoiningService|NodeRegistrationOwner|QuerySystemStatePhase)\(/gu;
// A node process or container start: its environment names the node's
// registration address (an env object key, a computed harness env key or a
// KEY=value word), or it enters the runtime or the embedded factory.
const NODE_PROCESS_START = new RegExp([
  '(?<![\\w.])NODE_ADDRESS(?:\\s*:|=)',
  'CONTAINER_ENV_KEYS\\.NODE_ADDRESS\\]',
  'startLagrangeRuntime\\(',
  'createEmbeddedLagrange\\(',
].join('|'), 'u');
const HOST_DECLARATION = /\bNODE_HOST_ID\b/u;

// Files a marker names that start no node of their own, each with the reason.
const NOT_A_START_SITE = Object.freeze({
  // Production entry points: they pass the operator's environment and
  // configuration through, and the runtime refuses a missing host.
  'src/index.js': 'operator environment, refused by the runtime',
  'src/embedded-lagrange.js': 'consumer configuration, refused by the runtime',
  'src/lagrange-runtime-startup.js': 'the runtime that refuses (resolveRuntimeHostId)',
  // Vocabulary tables that name the NODE_ADDRESS key, never an env.
  'src/bootstrap/owners/bootstrap-join-admission-owner.js': 'vocabulary',
  'src/cli/cli-constants.js': 'vocabulary',
  'src/constants/columns.js': 'vocabulary',
  'src/constants/fields.js': 'vocabulary',
  'src/control-plane/control-plane-constants.js': 'vocabulary',
  // The embedded worker starts with the environment its parent harness
  // (embedded-cluster-harness.js buildNodeEnvironment) declares.
  'test/integration/helpers/embedded-node-worker.js': 'parent harness env',
  'test/distributed/harness/__tests__/chaos.test.js':
    'fake container inspect env, no node starts',
  'test/distributed/harness/__tests__/docker-provider.test.js':
    'provider unit test: fake containers, no node starts',
  'test/distributed/harness/__tests__/cluster-control-plane-quiescence-lifecycle-test-cases.js':
    'asserts the env _buildNodeEnv declares',
  'test/release/public-api-side-effect-boundary.test.js': 'never starts a node',
  'test/release/public-consumer-contract-ratchet.test.js': 'never starts a node',
});

function sourceFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(join(ROOT, directory), {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        files.push(path);
      }
    }
  };
  for (const root of SCANNED_ROOTS) walk(root);
  return files.filter((file) => file !== THIS_FILE);
}

// The text with its comments blanked (same length), so a quote or a brace
// inside a comment is not code.
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\\])\/\/[^\n]*/gu,
    (comment) => comment.replace(/[^\n]/gu, ' '));
}

// The object literal opened at text[open] === '{', up to its closing brace.
function objectLiteralAt(text, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
  }
  return '';
}

// Top-level keys of an object literal (nested literals are skipped).
function topLevelDeclaresHostId(literal) {
  let depth = 0;
  let quote = null;
  let topLevel = '';
  for (let index = 0; index < literal.length; index += 1) {
    const character = literal[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if ('{[('.includes(character)) {
      depth += 1;
    } else if ('}])'.includes(character)) {
      depth -= 1;
    } else if (depth === 1) {
      topLevel += character;
    }
  }
  return /(?:^|[\s,])hostId\s*[:,]|(?:^|[\s,])hostId\s*$/u.test(topLevel);
}

test('every in-process node construction declares its host', () => {
  const omissions = [];
  let sites = 0;
  for (const file of sourceFiles()) {
    const text = withoutComments(readFileSync(join(ROOT, file), 'utf8'));
    for (const match of text.matchAll(NODE_CONSTRUCTION)) {
      sites += 1;
      const open = match.index + match[0].length;
      const line = text.slice(0, match.index).split('\n').length;
      if (text[open] !== '{' || !topLevelDeclaresHostId(objectLiteralAt(text, open))) {
        omissions.push(`${file}:${line} ${match[1]}`);
      }
    }
  }
  assert.ok(sites > 300, `the census found the construction sites (${sites})`);
  assert.deepEqual(omissions, [],
    'node constructions without a declared hostId (topology/node-host-identity.js)');
});

test('every node process or container start site declares NODE_HOST_ID', () => {
  const omissions = [];
  const stale = new Set(Object.keys(NOT_A_START_SITE));
  for (const file of sourceFiles()) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    if (!NODE_PROCESS_START.test(text)) continue;
    if (Object.hasOwn(NOT_A_START_SITE, file)) {
      stale.delete(file);
      continue;
    }
    if (!HOST_DECLARATION.test(text)) omissions.push(file);
  }
  assert.deepEqual(omissions, [], 'start sites without NODE_HOST_ID');
  assert.deepEqual([...stale], [],
    'every NOT_A_START_SITE entry still names a file the census matches');
});

test('the chart declares the pod\'s Kubernetes node for both StatefulSets', () => {
  const helpers = readFileSync(join(ROOT, 'charts/lagrange-node/templates/_helpers.tpl'),
    'utf8');
  const envCommon = helpers.slice(helpers.indexOf('define "lagrange-node.envCommon"'));
  assert.match(envCommon,
    /- name: NODE_HOST_ID\n\s+valueFrom:\n\s+fieldRef:\n\s+fieldPath: spec\.nodeName/u);
  for (const role of ['seed', 'joiner']) {
    const statefulSet = readFileSync(
      join(ROOT, `charts/lagrange-node/templates/statefulset-${role}.yaml`), 'utf8');
    assert.match(statefulSet, /include "lagrange-node\.envCommon"/u, role);
  }
});

test('distributed configs: a local run declares this machine, a remote ' +
  'provider its declared name, and a remote provider without one refuses', () => {
  const directory = join(ROOT, 'test/distributed/config');
  const configs = readdirSync(directory).filter((name) => name.endsWith('.json'))
    .map((name) => [name, JSON.parse(readFileSync(join(directory, name), 'utf8'))])
    .filter(([, config]) => Number.isSafeInteger(config.size));
  assert.ok(configs.length > 10);
  for (const [name, config] of configs) {
    if (config.gcp) {
      // The provisioned shape gcp-run-orchestration.js merges in: one
      // provider per VM, hostInfo from GCPProvisioner.provision().
      const vmCount = config.gcp.vmCount;
      const provisioned = {...config, docker: {...config.docker,
        hosts: Array.from({length: vmCount}, (_, i) => `tcp://34.0.0.${i}:2376`),
        hostInfo: Array.from({length: vmCount}, (_, i) => ({
          externalIp: `34.0.0.${i}`, internalIp: `10.0.0.${i}`,
          hostName: `ddb-test-vm-${i}-a1`}))}};
      const assignment = CLUSTER_STARTUP_GATE_LAYER.distributeNodes(config.size,
        new Array(vmCount), config.nodesPerHost || config.size);
      for (const providerIndex of assignment) {
        assert.equal(resolveProviderHostName(provisioned, providerIndex),
          `ddb-test-vm-${providerIndex}-a1`, name);
      }
      const unnamed = {...provisioned, docker: {...provisioned.docker,
        hostInfo: provisioned.docker.hostInfo.map(({hostName: _name, ...rest}) => rest)}};
      assert.throws(() => resolveProviderHostName(unnamed, 0),
        /host_name_undeclared/u, name);
    } else {
      assert.equal(resolveProviderHostName(config, 0), hostname(), name);
    }
  }
  const provisioner = readFileSync(join(ROOT,
    'test/distributed/harness/gcp-provisioner.js'), 'utf8');
  assert.match(provisioner, /hostName: this\._vmNames\[i\]/u,
    'the provisioner names each VM\'s host');
});

test('the lab harness declares each node\'s lab host name', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'lagrange-host-census-'));
  t.after(() => rm(directory, {force: true, recursive: true}));
  const base = join(directory, 'base.json');
  await writeFile(base, JSON.stringify({size: 3, docker: {socketPath: '/x'}}));
  const nodes = [{name: 'tv-dator', ip: '192.168.86.27'},
    {name: 'adam-laptop', ip: '192.168.86.30'},
    {name: 'carinas-windows', ip: '192.168.86.31'}];
  const config = await buildRemoteConfig(base, nodes, [1, 2, 3],
    join(directory, 'out.json'), 1, ['boot:a', 'boot:b', 'boot:c']);
  assert.deepEqual(config.docker.hostInfo.map((entry) => entry.hostName),
    nodes.map((node) => node.name));
  assert.deepEqual([0, 1, 2].map((index) =>
    resolveProviderHostName(config, index)), nodes.map((node) => node.name));
});

test('the comparative deployer declares the name each data host answers, and ' +
  'refuses a node whose host answers none', async () => {
  const hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
  const input = (sshRun) => ({hosts, clientIp: '10.0.0.9', sshRun,
    campaignId: 'camp-host-census', sleep: async () => {},
    opts: {lagrangeImage: LAGRANGE_IMAGE, readiness: {stablePolls: 1, attempts: 2,
      intervalMs: 0, timeoutMs: 50, pollIntervalMs: 1}}});
  const declared = createScriptedSsh(lagrangeHealthyRules(createContainerLedger(), {hosts}));
  await deployers.deployComparativeTarget('lagrange', input(declared.sshRun));
  const starts = declared.calls.filter((call) =>
    /^docker run -d .*lagrange-node/u.test(call.command));
  assert.equal(starts.length, hosts.length);
  for (const start of starts) {
    assert.ok(start.command.includes(` -e NODE_HOST_ID=${dataHostName(start.host)} `),
      `${start.host}: ${start.command}`);
  }

  const silent = createScriptedSsh([[/^hostname$/u, (command, host) =>
    host === '10.0.0.2' ? '' : dataHostName(host)],
  ...lagrangeHealthyRules(createContainerLedger(), {hosts})]);
  await assert.rejects(deployers.deployComparativeTarget('lagrange', input(silent.sshRun)),
    (error) => error.code === 'deployment_command_failed' &&
      error.diagnostic?.reason === 'host_name_unreadable');
  assert.equal(silent.calls.some((call) => call.host === '10.0.0.2' &&
    /^docker run -d .*lagrange-node/u.test(call.command)), false,
  'a node without a host never starts');
});

test('dev and embedded harnesses declare this machine', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');
  assert.match(read('test/integration/helpers/embedded-cluster-harness.js'),
    /NODE_HOST_ID: node\.hostId/u);
  assert.match(read('test/integration/helpers/embedded-cluster-harness.js'),
    /hostId: nodeOptions\.hostId \?\? hostname\(\)/u);
  assert.match(read('scripts/build-executables.sh'),
    /NODE_HOST_ID="\$\(hostname\)" "\$DIST_DIR\/lagrange" --dry-run/u);
  assert.match(read('scripts/release-npm-package.js'), /NODE_HOST_ID: hostname\(\)/u);
  const {spec} = generateClusterSpec({profile: PROFILE.SCENARIO_A_DEV_FORMATION,
    memberCount: 3, basePort: 21000});
  for (const member of spec.members) {
    assert.deepEqual(member.argv.slice(0, 2), ['/bin/sh', '-c']);
    assert.match(member.argv[2], /NODE_HOST_ID="\$\(hostname\)"; export NODE_HOST_ID; exec "\$@"/u);
    assert.equal(member.argv[4], 'node', 'the member command follows');
  }
  assert.equal(requireDeclaredNodeHostId(hostname()), hostname(),
    'this machine\'s name is a valid declared host');
  assert.throws(() => requireDeclaredNodeHostId(undefined),
    {code: NODE_HOST_ID_ERROR_CODE.REQUIRED});
});
