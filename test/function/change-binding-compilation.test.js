import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {beforeEach, describe, test} from 'node:test';

import {
  assertCompiledServiceDefinitionRow,
  createBindingCompilationKit,
  resetTestSingletons,
} from '../wasm-service/binding-compilation-test-harness.js';

const TENANT_ID = 'tenant-change';
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const LEGACY_MANAGER_PATH = 'src/function/cdc-subscription-manager.js';
const LEGACY_MANAGER_TEST_PATH =
  'test/function/cdc-subscription-manager.test.js';
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'change-deployer',
  roles: Object.freeze(['deployer']),
});

function manifest() {
  return {
    schema_version: 3,
    name: 'orders-change-service',
    version: '1.0.0',
    capabilities: ['clock.read', 'network.client'],
    exports: [{
      name: 'run',
      interface: 'change_v1',
    }],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/acme/orders-change:1.0.0',
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
    name: 'orders-change',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'run',
    },
    source: {
      kind: 'change',
      operations: ['delete', 'insert', 'update'],
      tables: ['table:global.audit', 'table:global.orders'],
    },
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 8192,
      context_bytes: 16384,
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
      signature: {status: 'verified', keyId: 'publisher-change'},
    },
  };
}

const kit = createBindingCompilationKit({
  tenantId: TENANT_ID,
  securityContext: SECURITY_CONTEXT,
  nowMs: 1000,
  plannerNodeId: 'node-change',
  replicaNodeId: () => 'node-change',
  artifactDigest: ARTIFACT_DIGEST,
  buildManifest: manifest,
  buildBindingInput: bindingInput,
  buildResolvedArtifact: resolvedArtifact,
});

describe('change Binding compilation cutover', () => {
  beforeEach(() => {
    resetTestSingletons();
  });

  test('production planning activates the full source projection and admits ' +
    'one system-owned placement path without dispatching an event', async () => {
    const fixture = await kit.createFixture();
    fixture.gateway.writes.length = 0;
    const planner = kit.createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();

    const {projection, row} = assertCompiledServiceDefinitionRow({
      fixture,
      planner,
      runtimeRef:
        `registry.example.test/acme/orders-change:1.0.0@${ARTIFACT_DIGEST}`,
    });
    assert.deepEqual(projection.declaration.source, fixture.input.source);
    assert.deepEqual(
      projection.declaration.capabilities,
      ['clock.read', 'network.client'],
    );
    await kit.assertComponentReadiness(row, fixture.bindingRow);
    planner.owner.shutdown();
  });

  test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
    'and concurrent replay converge', async () => {
    await kit.runReplayConvergenceScenario();
  });

  test('conflicting and malformed durable change state fails closed',
    async () => {
      await kit.runFailClosedScenario({corruptFillChar: 'f'});
    });

  test('the legacy declaration, callback API, tests, and private constants ' +
    'are absent', () => {
    assert.equal(existsSync(LEGACY_MANAGER_PATH), false);
    assert.equal(existsSync(LEGACY_MANAGER_TEST_PATH), false);
    const constants = readFileSync(
      'src/function/function-constants.js', 'utf8',
    );
    assert.doesNotMatch(
      constants,
      /FUNCTION_SUBSCRIPTION_TYPE|FUNCTION_CDC_MATCH_TYPE|FUNCTION_CDC_OPERATION|FUNCTION_CDC_PREDICATE|FUNCTION_EVENT|FUNCTION_PREDICATE|FUNCTION_SEPARATOR/u,
    );
    assert.doesNotMatch(
      constants,
      /SUBSCRIPTION_MANAGER|SUBSCRIPTION_INVOKE|CDC_CALLBACK|CDC_INVOKE/u,
    );
  });
});
