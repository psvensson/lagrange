import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const ADMIN_HOST_ENV = 'ADMIN_WS_HOST';
const ADMIN_INSECURE_ENV = 'ADMIN_ALLOW_INSECURE_EXTERNAL_BIND';
const ADMIN_PORT_ENV = 'ADMIN_WS_PORT';
const REST_PORT_ENV = 'REST_API_PORT';
const TRANSPORT_PORT_ENV = 'TRANSPORT_WS_PORT';
const REST_PORT = 8080;
const ADMIN_PORT = 8081;
const TRANSPORT_PORT = 8082;
const LEGACY_VALUES =
  'test/fixtures/helm/legacy-insecure-lagrange-node-values.yaml';

function assertRenderRejected(result, expectedPattern) {
  assert.equal(result.error, null, result.error?.message);
  assert.notEqual(result.status, 0, 'insecure values unexpectedly rendered');
  assert.match(`${result.stdout}\n${result.stderr}`, expectedPattern);
}

function resolveExpectedPorts(expectedPorts = {}) {
  return {
    restPort: expectedPorts.restPort ?? REST_PORT,
    adminPort: expectedPorts.adminPort ?? ADMIN_PORT,
    transportPort: expectedPorts.transportPort ?? TRANSPORT_PORT,
  };
}

function hasAdminContainerPort(ports, adminPort) {
  return ports.some((port) => [
    port.name === 'admin-ws',
    port.containerPort === adminPort,
  ].includes(true));
}

function hasNamedContainerPort(ports, name, expectedPort) {
  return ports.some((port) =>
    port.name === name && port.containerPort === expectedPort);
}

function assertHttpProbe(probe, expectedPath) {
  assert.equal(probe?.httpGet?.path, expectedPath);
  assert.equal(probe?.httpGet?.port, 'rest');
}

function assertSafeContainer(container, expectedPorts = {}) {
  const {restPort, adminPort, transportPort} =
    resolveExpectedPorts(expectedPorts);
  const entries = container.env ?? [];
  const ports = container.ports ?? [];
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_HOST_ENV).length, 1);
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_INSECURE_ENV).length, 1);
  assert.equal(entries.filter((entry) =>
    entry.name === ADMIN_PORT_ENV).length, 1);
  const environment = literalEnvironment(container);
  assert.equal(environment.get(ADMIN_HOST_ENV), '127.0.0.1');
  assert.equal(environment.get(ADMIN_INSECURE_ENV), 'false');
  assert.equal(environment.get(REST_PORT_ENV), String(restPort));
  assert.equal(environment.get(ADMIN_PORT_ENV), String(adminPort));
  assert.equal(environment.get(TRANSPORT_PORT_ENV), String(transportPort));
  assert.equal(hasAdminContainerPort(ports, adminPort), false);
  assert.equal(hasNamedContainerPort(ports, 'rest', restPort), true);
  assert.equal(
    hasNamedContainerPort(ports, 'transport-ws', transportPort),
    true,
  );
  assertHttpProbe(container.livenessProbe, '/livez');
  assertHttpProbe(container.readinessProbe, '/readyz');
}

function assertSafeServices(manifests, expectedPorts = {}) {
  const {restPort, adminPort, transportPort} =
    resolveExpectedPorts(expectedPorts);
  const services = manifests.filter((manifest) => manifest.kind === 'Service');
  assert.equal(services.length, 2);
  let transportServiceCount = 0;
  for (const service of services) {
    const ports = service.spec?.ports || [];
    assert.equal(ports.some((port) =>
      port.name === 'admin-ws' ||
      port.port === adminPort ||
      port.targetPort === 'admin-ws'), false);
    assert.equal(
      ports.find((port) => port.name === 'rest')?.port,
      restPort,
    );
    const transport = ports.find((port) => port.name === 'transport-ws');
    if (transport) {
      transportServiceCount += 1;
      assert.equal(transport.port, transportPort);
    }
  }
  assert.equal(transportServiceCount, 1);
}

function assertSafeRenderedManifests(manifests, expectedPorts) {
  const containers = workloadContainers(manifests);
  assert.equal(containers.length, 2);
  containers.forEach((container) => assertSafeContainer(container, expectedPorts));
  assertSafeServices(manifests, expectedPorts);
}

describe('lagrange-node Helm admin default deny', () => {
  it('keeps CLI, chart, and live-proof surfaces on the listener authority', () => {
    const surfaceContracts = [
      {
        path: 'src/cli/index.js',
        required: ['LISTENER_PORT_DEFAULT'],
        forbidden: /localhost:8081/u,
      },
      {
        path: 'src/cli/cli-constants.js',
        required: ['LISTENER_PORT_DEFAULT'],
        forbidden: /localhost:8081/u,
      },
      {
        path: 'src/cli/USER_GUIDE.md',
        required: ['REST port + 1', 'ADMIN_WS_PORT'],
        forbidden: /fixed port `8081`/u,
      },
      {
        path: 'charts/lagrange-node/README.md',
        required: ['admin.websocketPort', 'node.wsPort'],
        forbidden: /fixed (?:at )?8081/iu,
      },
      {
        path: 'charts/lagrange-node/values.yaml',
        required: ['admin.websocketPort', 'node.wsPort'],
        forbidden: /hardcoded runtime constant/iu,
      },
      {
        path: 'scripts/run-helm-admin-default-deny-live-scenario.js',
        required: ['LISTENER_PORT_DEFAULT'],
        forbidden: /\bPORT\s*:\s*808[01]\b/u,
      },
    ];

    for (const contract of surfaceContracts) {
      const source = fs.readFileSync(contract.path, 'utf8');
      for (const requiredText of contract.required) {
        assert.ok(
          source.includes(requiredText),
          `${contract.path} should expose ${requiredText}`,
        );
      }
      assert.doesNotMatch(
        source,
        contract.forbidden,
        `${contract.path} should not retain a contradictory fixed default`,
      );
    }
  });

  it('renders loopback-only admin env without publishing the admin port', () => {
    const {manifests} = renderLagrangeNode();
    assertSafeRenderedManifests(manifests);

    const nodePortRender = renderLagrangeNode([
      '--set',
      'service.type=NodePort',
    ]);
    assertSafeRenderedManifests(nodePortRender.manifests);
  });

  it('derives all listener ports from the REST base and honors overrides', () => {
    const derived = renderLagrangeNode([
      '--set',
      'node.restPort=9080',
    ]);
    assertSafeRenderedManifests(derived.manifests, {
      restPort: 9080,
      adminPort: 9081,
      transportPort: 9082,
    });

    const overridden = renderLagrangeNode([
      '--set',
      'node.restPort=9080',
      '--set',
      'admin.websocketPort=9181',
      '--set',
      'node.wsPort=9282',
    ]);
    assertSafeRenderedManifests(overridden.manifests, {
      restPort: 9080,
      adminPort: 9181,
      transportPort: 9282,
    });

    const highBaseWithOverrides = renderLagrangeNode([
      '--set',
      'node.restPort=65535',
      '--set',
      'admin.websocketPort=10',
      '--set',
      'node.wsPort=11',
    ]);
    assertSafeRenderedManifests(highBaseWithOverrides.manifests, {
      restPort: 65535,
      adminPort: 10,
      transportPort: 11,
    });
  });

  it('rejects every pairwise listener-port collision', () => {
    for (const [setting, collisionPorts] of [
      ['admin.websocketPort=9080', {restPort: 9080}],
      ['node.wsPort=9080', {restPort: 9080}],
      [
        'node.wsPort=9181',
        {restPort: 9080, adminWebsocketPort: 9181},
      ],
    ]) {
      const args = [
        '--skip-schema-validation',
        '--set',
        `node.restPort=${collisionPorts.restPort}`,
      ];
      if (collisionPorts.adminWebsocketPort) {
        args.push(
          '--set',
          `admin.websocketPort=${collisionPorts.adminWebsocketPort}`,
        );
      }
      args.push('--set', setting);
      const result = runHelmTemplate(args);
      assertRenderRejected(result, /listener ports must be distinct/iu);
    }
  });

  it('rejects out-of-range and overflowing listener ports without schema help',
    () => {
      for (const setting of [
        'node.restPort=0',
        'node.restPort=65534',
        'node.restPort=65535',
        'admin.websocketPort=65536',
        'node.wsPort=65536',
      ]) {
        const result = runHelmTemplate([
          '--skip-schema-validation',
          '--set',
          setting,
        ]);
        assertRenderRejected(
          result,
          /listener ports must be between 1 and 65535/iu,
        );
      }
    });

  it('rejects non-numeric listener values before Helm integer coercion', () => {
    for (const setting of [
      'node.restPort=true',
      'admin.websocketPort=true',
      'node.wsPort=true',
    ]) {
      const result = runHelmTemplate([
        '--skip-schema-validation',
        '--set',
        setting,
      ]);
      assertRenderRejected(result, /listener port must be an integer/iu);
    }
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
      REST_PORT_ENV,
      TRANSPORT_PORT_ENV,
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
