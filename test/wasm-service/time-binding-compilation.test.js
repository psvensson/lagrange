import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beforeEach, describe, test} from 'node:test';

import {
  assertCompiledServiceDefinitionRow,
  createBindingCompilationKit,
  resetTestSingletons,
} from './binding-compilation-test-harness.js';

const TENANT_ID = 'tenant-time';
const ARTIFACT_DIGEST = `sha256:${'d'.repeat(64)}`;
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'time-deployer',
  roles: Object.freeze(['deployer']),
});

function manifest() {
  return {
    schema_version: 3,
    name: 'orders-time-service',
    version: '1.0.0',
    capabilities: ['clock.read'],
    exports: [{
      name: 'run',
      interface: 'time_v1',
    }],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/acme/orders-time:1.0.0',
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
    },
    runtime: {
      kind: 'wasm_component',
    },
  };
}

function bindingInput(package_, _sourceKind, overrides = {}) {
  return {
    schema_version: 2,
    name: 'orders-refresh',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'run',
    },
    source: {kind: 'time', interval_ms: 60000},
    budgets: {
      cpu_time_ms: 50,
      wall_time_ms: 500,
      memory_bytes: 1048576,
      input_bytes: 1024,
      output_bytes: 2048,
      context_bytes: 4096,
    },
    ...overrides,
  };
}

function resolvedArtifact() {
  return {
    status: 'resolved',
    artifact: {
      digest: ARTIFACT_DIGEST,
      payloadMediaType: 'application/wasm',
      signature: {status: 'verified', keyId: 'publisher-time'},
    },
  };
}

const kit = createBindingCompilationKit({
  tenantId: TENANT_ID,
  securityContext: SECURITY_CONTEXT,
  nowMs: 2000,
  plannerNodeId: 'node-time',
  replicaNodeId: () => 'node-time',
  artifactDigest: ARTIFACT_DIGEST,
  buildManifest: manifest,
  buildBindingInput: bindingInput,
  buildResolvedArtifact: resolvedArtifact,
});

describe('time Binding compilation cutover', () => {
  beforeEach(() => {
    resetTestSingletons();
  });

  test('production planning activates the full source projection and admits ' +
    'one system-owned placement path without scheduling a timer', async () => {
    const fixture = await kit.createFixture();
    fixture.gateway.writes.length = 0;
    const planner = kit.createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();

    const {projection, row} = assertCompiledServiceDefinitionRow({
      fixture,
      planner,
      runtimeRef:
        `registry.example.test/acme/orders-time:1.0.0@${ARTIFACT_DIGEST}`,
    });
    assert.deepEqual(projection.declaration.source, {
      kind: 'time', interval_ms: 60000,
    });
    assert.deepEqual(projection.declaration.capabilities, ['clock.read']);
    const compilerSources = [
      'src/control-plane/owners/request-binding-service-definition-contract.js',
      'src/bootstrap/shared/runtime-service-rebalancer-setup.js',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    assert.doesNotMatch(
      compilerSources,
      /TimerManager|createTimer|onTimerFired/u,
    );
    await kit.assertComponentReadiness(row, fixture.bindingRow);
    planner.owner.shutdown();
  });

  test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
    'and concurrent replay converge', async () => {
    await kit.runReplayConvergenceScenario();
  });

  test('conflicting and malformed durable time state fails closed', async () => {
    await kit.runFailClosedScenario({corruptFillChar: 'e'});
  });
});
