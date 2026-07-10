import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  literalEnvironment,
  renderLagrangeNode,
  runHelmTemplate,
  workloadContainers,
} from '../../scripts/helm/lagrange-node-render.js';
import {
  assertRenderedCutover,
  buildReport,
  resolveRenderedEnvironment,
} from '../../scripts/run-helm-admin-default-deny-live-scenario.js';

const ADMIN_HOST_ENV = 'ADMIN_WEBSOCKET_HOST';
const ADMIN_INSECURE_ENV = 'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND';
const ADMIN_PORT_ENV = 'ADMIN_WEBSOCKET_PORT';
const ADMIN_PORT = 8081;
const LEGACY_VALUES =
  'test/fixtures/helm/legacy-insecure-lagrange-node-values.yaml';

function assertRenderRejected(result, expectedPattern) {
  assert.equal(result.error, null, result.error?.message);
  assert.notEqual(result.status, 0, 'insecure values unexpectedly rendered');
  assert.match(`${result.stdout}\n${result.stderr}`, expectedPattern);
}

function assertSafeContainer(container) {
  const entries = container.env || [];
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_HOST_ENV).length, 1);
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_INSECURE_ENV).length, 1);
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_PORT_ENV).length, 0);
  const environment = literalEnvironment(container);
  assert.equal(environment.get(ADMIN_HOST_ENV), '127.0.0.1');
  assert.equal(environment.get(ADMIN_INSECURE_ENV), 'false');
  assert.equal(
    (container.ports || []).some((port) =>
      port.name === 'admin-ws' || port.containerPort === ADMIN_PORT),
    false,
  );
  assert.equal(container.livenessProbe?.httpGet?.path, '/health');
  assert.equal(container.livenessProbe?.httpGet?.port, 'rest');
  assert.equal(container.readinessProbe?.httpGet?.path, '/readyz');
  assert.equal(container.readinessProbe?.httpGet?.port, 'rest');
}

function assertSafeServices(manifests) {
  const services = manifests.filter((manifest) => manifest.kind === 'Service');
  assert.equal(services.length, 2);
  for (const service of services) {
    const ports = service.spec?.ports || [];
    assert.equal(ports.some((port) =>
      port.name === 'admin-ws' ||
      port.port === ADMIN_PORT ||
      port.targetPort === 'admin-ws'), false);
    assert.equal(ports.some((port) => port.name === 'rest'), true);
  }
}

function assertSafeRenderedManifests(manifests) {
  const containers = workloadContainers(manifests);
  assert.equal(containers.length, 2);
  containers.forEach(assertSafeContainer);
  assertSafeServices(manifests);
}

describe('lagrange-node Helm admin default deny', () => {
  it('renders loopback-only admin env without publishing the admin port', () => {
    const {manifests} = renderLagrangeNode();
    assertSafeRenderedManifests(manifests);

    const nodePortRender = renderLagrangeNode([
      '--set',
      'service.type=NodePort',
    ]);
    assertSafeRenderedManifests(nodePortRender.manifests);
  });

  it('rejects the legacy insecure values even when schema checks are skipped', () => {
    for (const schemaArgs of [[], ['--skip-schema-validation']]) {
      const result = runHelmTemplate([
        '--values',
        LEGACY_VALUES,
        ...schemaArgs,
      ]);
      assertRenderRejected(result, /admin|insecure|loopback/iu);
    }
  });

  it('rejects direct and extraEnv admin binding bypasses', () => {
    const directAttacks = [
      ['admin.websocketHost=0.0.0.0', /loopback|websocketHost/iu],
      ['admin.allowInsecureExternalBind=true', /insecure|remain false/iu],
    ];
    for (const [setting, expectedPattern] of directAttacks) {
      const result = runHelmTemplate([
        '--skip-schema-validation',
        '--set',
        setting,
      ]);
      assertRenderRejected(result, expectedPattern);
    }

    for (const name of [
      ADMIN_HOST_ENV,
      ADMIN_INSECURE_ENV,
      ADMIN_PORT_ENV,
    ]) {
      for (const injection of [
        {name, value: '0.0.0.0'},
        {
          name,
          valueFrom: {secretKeyRef: {name: 'unsafe', key: 'value'}},
        },
      ]) {
        const extraEnv = runHelmTemplate([
          '--skip-schema-validation',
          '--set-json',
          `node.extraEnv=${JSON.stringify([injection])}`,
        ]);
        assertRenderRejected(extraEnv, /reserved|admin|extraEnv/iu);
      }
    }
  });

  it('keeps live-proof rendering and non-measurement semantics honest', () => {
    const {manifests} = renderLagrangeNode();
    const seedManifest = manifests.find((manifest) =>
      manifest.kind === 'StatefulSet' &&
      manifest.metadata?.labels?.['app.kubernetes.io/component'] === 'seed');
    const seedContainer = seedManifest.spec.template.spec.containers[0];
    assert.equal(
      assertRenderedCutover(manifests, seedContainer.image),
      seedContainer,
    );
    const environment = resolveRenderedEnvironment(seedContainer);
    assert.equal(environment.POD_NAMESPACE, 'lagrange-proof');
    assert.match(environment.NODE_ADDRESS, /lagrange-security-proof/iu);

    const incomplete = buildReport({
      timestamp: new Date(0).toISOString(),
      runId: 'blocked-run',
      passed: false,
      measuring: false,
      detail: {error: 'docker unavailable'},
    });
    assert.equal(incomplete.fidelity, 'live');
    assert.equal(incomplete.optimizationSummary.totalPriorityItems, null);
    assert.equal(
      incomplete.standardSummary.scenarios[0].current.verdictReason,
      'execution_incomplete_or_metrics_missing',
    );
  });
});
