import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beforeEach, describe, test} from 'node:test';

import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';
import {
  assertCompiledServiceDefinitionRow,
  createBindingCompilationKit,
  resetTestSingletons,
} from './binding-compilation-test-harness.js';

const TENANT_ID = 'tenant-once';
const ARTIFACT_DIGEST = `sha256:${'e'.repeat(64)}`;
const COMPONENT_EXPORT_NAME = 'run';
const COMPONENT_RUN_EXPORT_SOURCE_KINDS = new Set([
  'boot',
  'call',
  'once',
  'pushdown',
]);
const NAMED_BINDING_CELL_MODE = Object.freeze({
  ACTIVE: 'active',
});
const NAMED_BINDING_CELL_MODE_BY_SOURCE = Object.freeze({
  call: NAMED_BINDING_CELL_MODE.ACTIVE,
  pushdown: NAMED_BINDING_CELL_MODE.ACTIVE,
});
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT_ID,
  principal: 'once-deployer',
  roles: Object.freeze(['deployer']),
});

function manifest(sourceKind = 'once') {
  const exportName = COMPONENT_RUN_EXPORT_SOURCE_KINDS.has(sourceKind) ?
    COMPONENT_EXPORT_NAME :
    `${sourceKind}-handler`;
  return {
    schema_version: 3,
    name: `orders-${sourceKind}-service`,
    version: '1.0.0',
    capabilities: ['clock.read'],
    exports: [{
      name: exportName,
      interface: `${sourceKind}_v1`,
    }],
    artifact: {
      type: 'oci',
      ref: `registry.example.test/acme/orders-${sourceKind}:1.0.0`,
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
    },
    runtime: COMPONENT_RUN_EXPORT_SOURCE_KINDS.has(sourceKind) ?
      {kind: 'wasm_component'} :
      {
        kind: 'wasm_component',
        entrypoint: exportName,
        runtime_options: {memoryLimitMb: 16},
      },
  };
}

function bindingSource(sourceKind) {
  if (['call', 'pushdown'].includes(sourceKind)) {
    return {kind: sourceKind, name: `orders-${sourceKind}`};
  }
  return {kind: sourceKind};
}

function bindingInput(package_, sourceKind = 'once', overrides = {}) {
  return {
    schema_version: 2,
    name: `orders-${sourceKind}`,
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: COMPONENT_RUN_EXPORT_SOURCE_KINDS.has(sourceKind) ?
        COMPONENT_EXPORT_NAME :
        `${sourceKind}-handler`,
    },
    source: bindingSource(sourceKind),
    budgets: {
      cpu_time_ms: 25,
      wall_time_ms: 250,
      memory_bytes: 524288,
      input_bytes: 0,
      output_bytes: 1024,
      context_bytes: 2048,
    },
    ...overrides,
  };
}

function resolvedArtifact(sourceKind = 'once') {
  return {
    status: 'resolved',
    artifact: {
      digest: ARTIFACT_DIGEST,
      payloadMediaType: 'application/wasm',
      signature: {status: 'verified', keyId: `publisher-${sourceKind}`},
    },
  };
}

const kit = createBindingCompilationKit({
  tenantId: TENANT_ID,
  securityContext: SECURITY_CONTEXT,
  nowMs: 3000,
  plannerNodeId: 'node-once',
  replicaNodeId: (sourceKind) => `node-${sourceKind || 'once'}`,
  artifactDigest: ARTIFACT_DIGEST,
  buildManifest: (sourceKind) => manifest(sourceKind || 'once'),
  buildBindingInput: (package_, sourceKind, overrides) =>
    bindingInput(package_, sourceKind || 'once', overrides),
  buildResolvedArtifact: (sourceKind) => resolvedArtifact(sourceKind || 'once'),
});

describe('once Binding compilation cutover', () => {
  beforeEach(() => {
    resetTestSingletons();
  });

  test('production planning activates the kind-only full projection and ' +
    'admits one system-owned placement without one-shot invocation', async () => {
    const fixture = await kit.createFixture();
    fixture.gateway.writes.length = 0;
    const planner = kit.createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();

    const {projection, row} = assertCompiledServiceDefinitionRow({
      fixture,
      planner,
      runtimeRef:
        `registry.example.test/acme/orders-once:1.0.0@${ARTIFACT_DIGEST}`,
    });
    assert.equal(row[SD_COL.HANDLER_FUNCTION_ID], row[SD_COL.RUNTIME_REF]);
    assert.deepEqual(projection.declaration.source, {kind: 'once'});
    assert.deepEqual(projection.declaration.capabilities, ['clock.read']);
    const compilerSources = [
      'src/control-plane/owners/request-binding-service-definition-contract.js',
      'src/bootstrap/shared/runtime-service-rebalancer-setup.js',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    assert.doesNotMatch(
      compilerSources,
      /TimerManager|createTimer|onTimerFired|\.invoke\(/u,
    );
    await kit.assertComponentReadiness(row, fixture.bindingRow, 'once');
    planner.owner.shutdown();
  });

  test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
    'and concurrent replay converge', async () => {
    await kit.runReplayConvergenceScenario();
  });

  test('conflicting and malformed durable once state fails closed', async () => {
    await kit.runFailClosedScenario({corruptFillChar: 'd'});
  });
});

describe('boot Binding compilation cutover', () => {
  beforeEach(() => {
    resetTestSingletons();
  });

  test('production planning activates the kind-only projection and admits one ' +
    'system-owned placement without hooking cluster bootstrap', async () => {
    const fixture = await kit.createFixture({sourceKind: 'boot'});
    fixture.gateway.writes.length = 0;
    const planner = kit.createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();

    const {projection, row} = assertCompiledServiceDefinitionRow({
      fixture,
      planner,
      runtimeRef:
        `registry.example.test/acme/orders-boot:1.0.0@${ARTIFACT_DIGEST}`,
    });
    assert.deepEqual(projection.declaration.source, {kind: 'boot'});
    assert.deepEqual(projection.declaration.capabilities, ['clock.read']);
    const compilerSource = [
      'src/control-plane/owners/request-binding-service-definition-contract.js',
      'src/bootstrap/shared/runtime-service-rebalancer-setup.js',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    assert.doesNotMatch(
      compilerSource,
      /BOOTSTRAP_PHASE|BootstrapService|bootstrapPipeline|bootstrapApi|onBootstrap/u,
    );
    await kit.assertComponentReadiness(row, fixture.bindingRow, 'boot');
    planner.owner.shutdown();
  });

  test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
    'and concurrent replay converge', async () => {
    await kit.runReplayConvergenceScenario({
      fixtureOptions: {sourceKind: 'boot'},
    });
  });

  test('conflicting and malformed durable boot state fails closed', async () => {
    await kit.runFailClosedScenario({
      fixtureOptions: {sourceKind: 'boot'},
      corruptFillChar: 'c',
    });
  });
});

function defineNamedBindingCompilationCutover(sourceKind) {
  const cellMode = NAMED_BINDING_CELL_MODE_BY_SOURCE[sourceKind];
  const invocationKind = sourceKind === 'call' ?
    'a statement call' :
    'query pushdown';
  const forbiddenInvocationPattern = new RegExp([
    'CallbackExecutionHost',
    'PARTITION_CALLBACK',
    'WasmCallAdapter',
    'executePushdown',
    'executeRequest',
    'pushdownDecisions',
    'pushdownPlan',
  ].join('|'), 'u');
  const expectedActiveWrites =
    cellMode === NAMED_BINDING_CELL_MODE.ACTIVE ? 2 : 1;
  describe(`${sourceKind} Binding compilation cutover`, () => {
    beforeEach(() => {
      resetTestSingletons();
    });

    test('production planning preserves the named registration without ' +
      `registering or invoking ${invocationKind}`, async () => {
      const fixture = await kit.createFixture({sourceKind});
      fixture.gateway.writes.length = 0;
      const planner = kit.createPlanner(fixture);
      planner.owner.setLeader(true);
      await planner.owner.waitForBindingRefresh();

      const isActiveCellMode = cellMode === NAMED_BINDING_CELL_MODE.ACTIVE;
      const {projection, row} = assertCompiledServiceDefinitionRow({
        fixture,
        planner,
        runtimeRef:
          `registry.example.test/acme/orders-${sourceKind}:1.0.0@` +
            ARTIFACT_DIGEST,
        status: cellMode,
        expectedWriteCount: isActiveCellMode ? 2 : 1,
        expectRebalancer: isActiveCellMode,
      });
      assert.deepEqual(
        projection.declaration.source,
        {kind: sourceKind, name: `orders-${sourceKind}`},
      );
      assert.deepEqual(projection.declaration.capabilities, ['clock.read']);
      if (isActiveCellMode) {
        await kit.assertComponentReadiness(row, fixture.bindingRow, sourceKind);
      }
      const compilerSource = readFileSync(
        'src/control-plane/owners/request-binding-service-definition-contract.js',
        'utf8',
      );
      assert.doesNotMatch(
        compilerSource,
        forbiddenInvocationPattern,
      );
      planner.owner.shutdown();
    });

    test('cache wake, replay, leadership reacquisition, repair, lost response, ' +
      'and concurrent replay converge', async () => {
      await kit.runReplayConvergenceScenario({
        fixtureOptions: {sourceKind},
        expectedRepairWrites: expectedActiveWrites,
        expectedConcurrentWrites: expectedActiveWrites,
      });
    });

    test(`conflicting and malformed durable ${sourceKind} state fails closed`,
      async () => {
        await kit.runFailClosedScenario({
          fixtureOptions: {sourceKind},
          corruptFillChar: 'b',
        });
      });
  });
}

defineNamedBindingCompilationCutover('call');
defineNamedBindingCompilationCutover('pushdown');
