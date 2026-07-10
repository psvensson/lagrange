#!/usr/bin/env node

import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DockerProvider} from
  '../test/distributed/harness/docker-provider.js';
import {
  computeSourceFingerprint,
  SOURCE_FINGERPRINT_ENV_VAR,
} from '../src/diagnostics/source-fingerprint.js';
import {
  literalEnvironment,
  REPO_ROOT,
  renderLagrangeNode,
  workloadContainers,
} from './helm/lagrange-node-render.js';

const LIVE_PROOF = Object.freeze({
  SCENARIO: 'helm-admin-default-deny-cutover',
  PRODUCER: 'helm-admin-default-deny-live-scenario',
  FIDELITY: 'live',
  REPORT_DIR: 'test-output/reports',
  REPORT_SUFFIX: '.report.json',
  IMAGE_REPOSITORY: 'lagrange-helm-admin-live',
  NETWORK_PREFIX: 'lagrange-helm-admin-proof',
  NODE_SUFFIX: 'node',
  SIBLING_SUFFIX: 'sibling',
  NAMESPACE: 'lagrange-proof',
  POD_NAME: 'lagrange-security-proof-lagrange-node-seed-0',
  NODE_HOST_ENV: 'LAGRANGE_PROOF_NODE_HOST',
  PASS: 'PASS',
  FAIL: 'FAIL',
  INCOMPLETE: 'BLOCK_EVIDENCE_INCOMPLETE',
  INCOMPLETE_REASON: 'execution_incomplete_or_metrics_missing',
  FAILURE_REASON: 'core_invariant_or_safety_violation',
});

const ADMIN = Object.freeze({
  HOST_ENV: 'ADMIN_WEBSOCKET_HOST',
  INSECURE_ENV: 'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND',
  PORT_ENV: 'ADMIN_WEBSOCKET_PORT',
  HOST: '127.0.0.1',
  INSECURE: 'false',
  PORT: 8081,
  PORT_NAME: 'admin-ws',
});

const REST = Object.freeze({
  PORT: 8080,
  PORT_NAME: 'rest',
  HEALTH_PATH: '/health',
  READINESS_PATH: '/readyz',
  OK: 200,
  NOT_READY: 503,
});

const MANIFEST = Object.freeze({
  SERVICE_KIND: 'Service',
  STATEFULSET_KIND: 'StatefulSet',
  COMPONENT_LABEL: 'app.kubernetes.io/component',
  SEED_COMPONENT: 'seed',
  VALUE_PROPERTY: 'value',
  POD_NAME_FIELD: 'metadata.name',
  POD_NAMESPACE_FIELD: 'metadata.namespace',
});

const RUNTIME = Object.freeze({
  NODE_BINARY: '/nodejs/bin/node',
  MODULE_INPUT: '--input-type=module',
  EVAL: '-e',
  SOURCE_ENTRY: 'src/index.js',
  SOURCE_DIR: 'src',
  ERROR_SEPARATOR: '; ',
  MEMORY: '2g',
  CPU: '1.0',
  START_TIMEOUT_MS: 60_000,
  LOG_TAIL_LINES: 200,
});

const LABEL = Object.freeze({
  RUN: 'lagrange.proof.run',
  SCENARIO: 'lagrange.proof.scenario',
  FINGERPRINT: 'lagrange.proof.src-fingerprint',
});

const DOCKER_BUILD = Object.freeze({
  COMMAND: 'docker',
  BUILD: 'build',
  LABEL: '--label',
  TAG: '-t',
  CONTEXT: '.',
  MAX_BUFFER_BYTES: 20_971_520,
  FAILED: 'Current-tree Docker image build failed',
});

const ERROR_MESSAGE = Object.freeze({
  NO_WORKLOADS: 'Helm render did not contain both StatefulSet containers',
  NO_SEED: 'Helm render did not contain a seed StatefulSet container',
  IMAGE_MISMATCH: 'Rendered seed image did not match the live proof image',
  COMMAND_MISMATCH: 'Rendered seed command does not start src/index.js',
  ADMIN_ENV_DUPLICATE: 'Rendered admin environment is missing or duplicated',
  ADMIN_ENV_UNSAFE: 'Rendered admin environment is not loopback/false',
  ADMIN_PORT_ENV: 'Rendered environment overrides the fixed admin port',
  ADMIN_PORT_PUBLISHED: 'Rendered manifest publishes the admin port',
  REST_PORT_MISSING: 'Rendered Services do not preserve the REST port',
  REST_PROBES_MISSING: 'Rendered REST health/readiness probes are incomplete',
  FIELD_VALUE_MISSING: 'Rendered fieldRef cannot be resolved by the live proof',
  LOCAL_ADMIN_FAILED: 'Node-local admin listener did not become healthy',
  SIBLING_PROBE_FAILED: 'Sibling-network proof failed',
  FINGERPRINT_FAILED: 'Booted source fingerprint does not match the worktree',
  CLEANUP_FAILED: 'Run-owned Docker resources could not be cleaned up',
});

const LOCAL_ADMIN_PROBE_SOURCE = String.raw`
const deadline = Date.now() + 120000;
let last = null;
while (Date.now() < deadline) {
  try {
    const response = await fetch('http://127.0.0.1:8081/health');
    last = {status: response.status, body: await response.text()};
    if (response.status === 200) {
      console.log(JSON.stringify(last));
      process.exit(0);
    }
  } catch (error) {
    last = {error: error.cause?.code || error.code || error.message};
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.error(JSON.stringify(last));
process.exit(1);
`;

const SIBLING_IDLE_SOURCE = String.raw`
setInterval(() => {}, 60000);
`;

const SIBLING_PROBE_SOURCE = String.raw`
import net from 'node:net';

const nodeHost = process.env.LAGRANGE_PROOF_NODE_HOST;
const waitForRest = async () => {
  const deadline = Date.now() + 120000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://' + nodeHost + ':8080/health');
      last = {status: response.status, body: await response.text()};
      if (response.status === 200) return last;
    } catch (error) {
      last = {error: error.cause?.code || error.code || error.message};
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('REST health did not become reachable: ' + JSON.stringify(last));
};

const connectAdmin = () => new Promise((resolve) => {
  const socket = net.createConnection({host: nodeHost, port: 8081});
  const finish = (result) => {
    socket.destroy();
    resolve(result);
  };
  socket.setTimeout(5000, () => finish({code: 'ETIMEDOUT'}));
  socket.once('connect', () => finish({code: 'CONNECTED'}));
  socket.once('error', (error) => finish({code: error.code || 'UNKNOWN'}));
});

const health = await waitForRest();
const readinessResponse = await fetch(
  'http://' + nodeHost + ':8080/readyz',
);
const readinessText = await readinessResponse.text();
let readinessBody = null;
try {
  readinessBody = JSON.parse(readinessText);
} catch {
  readinessBody = null;
}
const admin = await connectAdmin();
const result = {
  admin,
  health,
  readiness: {
    status: readinessResponse.status,
    body: readinessBody,
    rawBody: readinessText,
  },
};
console.log(JSON.stringify(result));
const readinessStatusOk = [200, 503].includes(readinessResponse.status);
if (admin.code !== 'ECONNREFUSED' || health.status !== 200 ||
    !readinessStatusOk || readinessBody === null) {
  process.exit(1);
}
`;

const FINGERPRINT_PROBE_SOURCE = String.raw`
import {computeSourceFingerprint} from './src/diagnostics/source-fingerprint.js';
console.log(await computeSourceFingerprint('/app/src'));
`;

function countEnvironment(container, name) {
  return (container?.env || []).filter((entry) => entry?.name === name).length;
}

function servicePorts(manifests) {
  return manifests
    .filter((manifest) => manifest.kind === MANIFEST.SERVICE_KIND)
    .flatMap((manifest) => manifest.spec?.ports || []);
}

function requireWorkloadContainers(manifests) {
  const containers = workloadContainers(manifests);
  if (containers.length !== 2) {
    throw new Error(ERROR_MESSAGE.NO_WORKLOADS);
  }
  return containers;
}

function requireSeedContainer(manifests) {
  const seedManifest = manifests.find((manifest) =>
    manifest.kind === MANIFEST.STATEFULSET_KIND &&
    manifest.metadata?.labels?.[MANIFEST.COMPONENT_LABEL] ===
      MANIFEST.SEED_COMPONENT);
  const seedContainer = seedManifest?.spec?.template?.spec?.containers?.[0];
  if (!seedContainer) {
    throw new Error(ERROR_MESSAGE.NO_SEED);
  }
  return seedContainer;
}

function assertAdminEnvironment(container) {
  if (countEnvironment(container, ADMIN.HOST_ENV) !== 1 ||
      countEnvironment(container, ADMIN.INSECURE_ENV) !== 1) {
    throw new Error(ERROR_MESSAGE.ADMIN_ENV_DUPLICATE);
  }
  if (countEnvironment(container, ADMIN.PORT_ENV) !== 0) {
    throw new Error(ERROR_MESSAGE.ADMIN_PORT_ENV);
  }
  const environment = literalEnvironment(container);
  if (environment.get(ADMIN.HOST_ENV) !== ADMIN.HOST ||
      environment.get(ADMIN.INSECURE_ENV) !== ADMIN.INSECURE) {
    throw new Error(ERROR_MESSAGE.ADMIN_ENV_UNSAFE);
  }
}

function assertContainerPorts(container) {
  const publishesAdmin = (container.ports || []).some((port) =>
    port.name === ADMIN.PORT_NAME || port.containerPort === ADMIN.PORT);
  if (publishesAdmin) {
    throw new Error(ERROR_MESSAGE.ADMIN_PORT_PUBLISHED);
  }
}

function assertRestProbes(container) {
  const liveness = container.livenessProbe?.httpGet;
  const readiness = container.readinessProbe?.httpGet;
  if (liveness?.path !== REST.HEALTH_PATH ||
      liveness?.port !== REST.PORT_NAME ||
      readiness?.path !== REST.READINESS_PATH ||
      readiness?.port !== REST.PORT_NAME) {
    throw new Error(ERROR_MESSAGE.REST_PROBES_MISSING);
  }
}

function assertServicePorts(manifests) {
  const ports = servicePorts(manifests);
  const publishesAdmin = ports.some((port) =>
    port.name === ADMIN.PORT_NAME ||
    port.port === ADMIN.PORT ||
    port.targetPort === ADMIN.PORT_NAME);
  if (publishesAdmin) {
    throw new Error(ERROR_MESSAGE.ADMIN_PORT_PUBLISHED);
  }
  if (!ports.some((port) => port.name === REST.PORT_NAME)) {
    throw new Error(ERROR_MESSAGE.REST_PORT_MISSING);
  }
}

function assertSeedLaunch(seedContainer, imageTag) {
  if (seedContainer.image !== imageTag) {
    throw new Error(ERROR_MESSAGE.IMAGE_MISMATCH);
  }
  if (!Array.isArray(seedContainer.args) ||
      !seedContainer.args.includes(RUNTIME.SOURCE_ENTRY)) {
    throw new Error(ERROR_MESSAGE.COMMAND_MISMATCH);
  }
}

function assertRenderedCutover(manifests, imageTag) {
  const containers = requireWorkloadContainers(manifests);
  const seedContainer = requireSeedContainer(manifests);
  for (const container of containers) {
    assertAdminEnvironment(container);
    assertContainerPorts(container);
    assertRestProbes(container);
  }
  assertServicePorts(manifests);
  assertSeedLaunch(seedContainer, imageTag);
  return seedContainer;
}

function replaceEnvironmentReferences(value, environment) {
  return String(value).replace(/\$\(([^)]+)\)/gu, (match, name) =>
    Object.hasOwn(environment, name) ? environment[name] : match);
}

function resolveRenderedEnvironment(container) {
  const environment = {};
  const fieldValues = {
    [MANIFEST.POD_NAME_FIELD]: LIVE_PROOF.POD_NAME,
    [MANIFEST.POD_NAMESPACE_FIELD]: LIVE_PROOF.NAMESPACE,
  };
  for (const entry of container.env || []) {
    if (Object.hasOwn(entry, MANIFEST.VALUE_PROPERTY)) {
      environment[entry.name] = replaceEnvironmentReferences(
        entry.value,
        environment,
      );
      continue;
    }
    const fieldPath = entry.valueFrom?.fieldRef?.fieldPath;
    if (fieldPath && Object.hasOwn(fieldValues, fieldPath)) {
      environment[entry.name] = fieldValues[fieldPath];
      continue;
    }
    throw new Error(ERROR_MESSAGE.FIELD_VALUE_MISSING);
  }
  return environment;
}

function parseExecJson(result, errorMessage) {
  if (result.exitCode !== 0) {
    throw new Error(`${errorMessage}: ${result.stderr || result.stdout}`);
  }
  const lines = result.stdout.trim().split(/\r?\n/gu).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function buildReport(options) {
  const passed = options.passed === true;
  const measuring = options.measuring !== false;
  const verdict = passed ? LIVE_PROOF.PASS :
    measuring ? LIVE_PROOF.FAIL : LIVE_PROOF.INCOMPLETE;
  const verdictReason = passed ? null :
    measuring ? LIVE_PROOF.FAILURE_REASON : LIVE_PROOF.INCOMPLETE_REASON;
  return {
    timestamp: options.timestamp,
    runId: options.runId,
    scenario: LIVE_PROOF.SCENARIO,
    producer: LIVE_PROOF.PRODUCER,
    fidelity: LIVE_PROOF.FIDELITY,
    summary: {
      total: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
    },
    optimizationSummary: {
      totalPriorityItems: measuring ? passed ? 0 : 1 : null,
    },
    standardSummary: {
      scenarios: [
        {
          scenario: LIVE_PROOF.SCENARIO,
          passed,
          current: {passed, verdict, verdictReason},
          detail: options.detail,
        },
      ],
    },
  };
}

async function writeReportFile(report) {
  await mkdir(LIVE_PROOF.REPORT_DIR, {recursive: true});
  const stamp = report.timestamp.replace(/[:.]/gu, '-');
  const file = resolve(
    LIVE_PROOF.REPORT_DIR,
    `${LIVE_PROOF.SCENARIO}-${stamp}${LIVE_PROOF.REPORT_SUFFIX}`,
  );
  await writeFile(file, JSON.stringify(report, null, 2));
  return file;
}

async function cleanupRunResources(provider, resources) {
  const errors = [];
  for (const containerId of [
    resources.siblingContainerId,
    resources.nodeContainerId,
  ]) {
    if (!containerId) continue;
    try {
      await provider.removeContainer(containerId);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (resources.networkId) {
    try {
      await provider.removeNetwork(resources.networkId);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

function buildCurrentTreeImage(imageTag, labels) {
  const labelArgs = Object.entries(labels)
    .flatMap(([name, value]) => [DOCKER_BUILD.LABEL, `${name}=${value}`]);
  const result = spawnSync(DOCKER_BUILD.COMMAND, [
    DOCKER_BUILD.BUILD,
    ...labelArgs,
    DOCKER_BUILD.TAG,
    imageTag,
    DOCKER_BUILD.CONTEXT,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: DOCKER_BUILD.MAX_BUFFER_BYTES,
  });
  if (result.status !== 0) {
    throw new Error(
      `${DOCKER_BUILD.FAILED}: ${result.stderr || result.error?.message}`,
    );
  }
}

class NonMeasuringProofError extends Error {}

function createLiveProofContext() {
  const timestamp = new Date().toISOString();
  const runId = timestamp.replace(/[:.]/gu, '-');
  const shortRunId = runId.slice(-24);
  const names = {
    network: `${LIVE_PROOF.NETWORK_PREFIX}-${shortRunId}`,
    node: `${LIVE_PROOF.NETWORK_PREFIX}-${LIVE_PROOF.NODE_SUFFIX}-${shortRunId}`,
    sibling:
      `${LIVE_PROOF.NETWORK_PREFIX}-${LIVE_PROOF.SIBLING_SUFFIX}-${shortRunId}`,
  };
  return {
    timestamp,
    runId,
    names,
    provider: new DockerProvider(),
    resources: {},
    sourceFingerprint: null,
    imageTag: null,
    seedContainer: null,
    environment: null,
    network: null,
    node: null,
    sibling: null,
    detail: {
      runId,
      names,
      render: null,
      docker: null,
      localAdmin: null,
      sibling: null,
      sourceFingerprint: null,
      nodeExit: null,
      nodeLogs: null,
      cleanupErrors: [],
      error: null,
    },
  };
}

async function prepareRenderedRuntime(context) {
  context.sourceFingerprint = await computeSourceFingerprint(
    resolve(REPO_ROOT, RUNTIME.SOURCE_DIR),
  );
  context.imageTag =
    `${LIVE_PROOF.IMAGE_REPOSITORY}:${context.sourceFingerprint}`;
  const render = renderLagrangeNode([
    '--set-string',
    `image.repository=${LIVE_PROOF.IMAGE_REPOSITORY}`,
    '--set-string',
    `image.tag=${context.sourceFingerprint}`,
    '--set',
    'persistence.enabled=false',
    '--set',
    'joiners.replicas=0',
  ], {
    namespace: LIVE_PROOF.NAMESPACE,
  });
  context.seedContainer = assertRenderedCutover(
    render.manifests,
    context.imageTag,
  );
  context.environment = resolveRenderedEnvironment(context.seedContainer);
  context.environment[SOURCE_FINGERPRINT_ENV_VAR] = context.sourceFingerprint;
  context.detail.render = {
    image: context.seedContainer.image,
    args: context.seedContainer.args,
    adminEnvironment: {
      [ADMIN.HOST_ENV]: context.environment[ADMIN.HOST_ENV],
      [ADMIN.INSECURE_ENV]: context.environment[ADMIN.INSECURE_ENV],
      [ADMIN.PORT_ENV]: context.environment[ADMIN.PORT_ENV] ?? null,
    },
    restProbePaths: {
      liveness: context.seedContainer.livenessProbe.httpGet.path,
      readiness: context.seedContainer.readinessProbe.httpGet.path,
    },
  };
  context.detail.sourceFingerprint = {
    expected: context.sourceFingerprint,
    booted: null,
    matches: false,
  };
}

async function createProofNetwork(context) {
  try {
    context.network = await context.provider.createNetwork(
      context.names.network,
      {
        [LABEL.RUN]: context.runId,
        [LABEL.SCENARIO]: LIVE_PROOF.SCENARIO,
      },
    );
    context.resources.networkId = context.network.id;
  } catch (error) {
    throw new NonMeasuringProofError(error.message, {cause: error});
  }
}

async function buildProofImage(context) {
  buildCurrentTreeImage(context.imageTag, {
    [LABEL.RUN]: context.runId,
    [LABEL.SCENARIO]: LIVE_PROOF.SCENARIO,
    [LABEL.FINGERPRINT]: context.sourceFingerprint,
  });
  const image = await context.provider.inspectImage(context.imageTag);
  context.detail.docker = {
    imageId: image?.Id || null,
    imageTag: context.imageTag,
    networkId: context.network.id,
    networkName: context.network.name,
    nodeContainerId: null,
    siblingContainerId: null,
  };
}

async function startProofContainers(context) {
  context.node = await context.provider.createContainer({
    name: context.names.node,
    image: context.imageTag,
    network: context.network.name,
    env: context.environment,
    command: context.seedContainer.args,
    labels: {
      [LABEL.RUN]: context.runId,
      [LABEL.SCENARIO]: LIVE_PROOF.SCENARIO,
    },
    resourceLimits: {memory: RUNTIME.MEMORY, cpus: RUNTIME.CPU},
    startTimeout: RUNTIME.START_TIMEOUT_MS,
  });
  context.resources.nodeContainerId = context.node.containerId;
  context.detail.docker.nodeContainerId = context.node.containerId;

  context.sibling = await context.provider.createContainer({
    name: context.names.sibling,
    image: context.imageTag,
    network: context.network.name,
    env: {[LIVE_PROOF.NODE_HOST_ENV]: context.names.node},
    entrypoint: [RUNTIME.NODE_BINARY],
    command: [RUNTIME.EVAL, SIBLING_IDLE_SOURCE],
    labels: {
      [LABEL.RUN]: context.runId,
      [LABEL.SCENARIO]: LIVE_PROOF.SCENARIO,
    },
    startTimeout: RUNTIME.START_TIMEOUT_MS,
  });
  context.resources.siblingContainerId = context.sibling.containerId;
  context.detail.docker.siblingContainerId = context.sibling.containerId;
}

async function runEndpointProbes(context) {
  const localAdminResult = await context.provider.execInContainer(
    context.node.containerId,
    [
      RUNTIME.NODE_BINARY,
      RUNTIME.MODULE_INPUT,
      RUNTIME.EVAL,
      LOCAL_ADMIN_PROBE_SOURCE,
    ],
  );
  context.detail.localAdmin = parseExecJson(
    localAdminResult,
    ERROR_MESSAGE.LOCAL_ADMIN_FAILED,
  );

  const siblingResult = await context.provider.execInContainer(
    context.sibling.containerId,
    [
      RUNTIME.NODE_BINARY,
      RUNTIME.MODULE_INPUT,
      RUNTIME.EVAL,
      SIBLING_PROBE_SOURCE,
    ],
  );
  context.detail.sibling = parseExecJson(
    siblingResult,
    ERROR_MESSAGE.SIBLING_PROBE_FAILED,
  );
}

async function verifyBootedFingerprint(context) {
  const fingerprintResult = await context.provider.execInContainer(
    context.node.containerId,
    [
      RUNTIME.NODE_BINARY,
      RUNTIME.MODULE_INPUT,
      RUNTIME.EVAL,
      FINGERPRINT_PROBE_SOURCE,
    ],
  );
  if (fingerprintResult.exitCode !== 0) {
    throw new Error(ERROR_MESSAGE.FINGERPRINT_FAILED);
  }
  const bootedFingerprint = fingerprintResult.stdout.trim().split(/\r?\n/gu)
    .filter(Boolean)
    .at(-1);
  context.detail.sourceFingerprint.booted = bootedFingerprint;
  context.detail.sourceFingerprint.matches =
    bootedFingerprint === context.sourceFingerprint;
  if (!context.detail.sourceFingerprint.matches) {
    throw new Error(ERROR_MESSAGE.FINGERPRINT_FAILED);
  }
}

async function executeLiveProof(context) {
  await prepareRenderedRuntime(context);
  await createProofNetwork(context);
  await buildProofImage(context);
  await startProofContainers(context);
  await runEndpointProbes(context);
  await verifyBootedFingerprint(context);
}

async function captureNodeFailureDiagnostics(context) {
  if (!context.resources.nodeContainerId) {
    return;
  }
  try {
    const state = await context.provider.inspectContainerIfExists(
      context.resources.nodeContainerId,
    );
    context.detail.nodeExit = state?.State || null;
    context.detail.nodeLogs = await context.provider.getContainerLogs(
      context.resources.nodeContainerId,
      {tail: RUNTIME.LOG_TAIL_LINES},
    );
  } catch (error) {
    context.detail.nodeLogs = error.message;
  }
}

function applyCleanupResult(detail, cleanupErrors, passed) {
  detail.cleanupErrors = cleanupErrors;
  if (cleanupErrors.length === 0) {
    return passed;
  }
  detail.error = `${ERROR_MESSAGE.CLEANUP_FAILED}: ` +
    cleanupErrors.join(RUNTIME.ERROR_SEPARATOR);
  return false;
}

async function writeLiveProofResult(context, passed, measuring) {
  const report = buildReport({
    timestamp: context.timestamp,
    runId: context.runId,
    passed,
    measuring,
    detail: context.detail,
  });
  const reportFile = await writeReportFile(report);
  const verdict = passed ?
    LIVE_PROOF.PASS :
    report.standardSummary.scenarios[0].current.verdict;
  process.stdout.write(
    `${LIVE_PROOF.SCENARIO}: ${verdict}\nreport: ${reportFile}\n`,
  );
  process.exitCode = passed ? 0 : 1;
  return {report, reportFile};
}

async function runLiveProof() {
  const context = createLiveProofContext();
  let passed = false;
  let measuring = true;
  try {
    await executeLiveProof(context);
    passed = true;
  } catch (error) {
    context.detail.error = error.message;
    measuring = !(error instanceof NonMeasuringProofError);
    await captureNodeFailureDiagnostics(context);
  }
  const cleanupErrors = await cleanupRunResources(
    context.provider,
    context.resources,
  );
  passed = applyCleanupResult(context.detail, cleanupErrors, passed);
  return writeLiveProofResult(context, passed, measuring);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await runLiveProof();
}

export {
  assertRenderedCutover,
  buildCurrentTreeImage,
  buildReport,
  resolveRenderedEnvironment,
  runLiveProof,
};
