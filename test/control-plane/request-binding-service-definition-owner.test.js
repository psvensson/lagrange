import assert from 'node:assert/strict';
import {beforeEach, describe, test} from 'node:test';

import {
  RuntimeServiceRebalancerOwner,
} from '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {TABLES} from '../../src/constants/index.js';
import {
  REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE,
  RequestBindingServiceDefinitionError,
  buildRequestBindingServiceDefinition,
  createSystemMetadataOwners,
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/index.js';
import {supportsBindingServiceDefinitionSourceKind} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SD_COL} from '../../src/wasm-service/wasm-service-models.js';
import {createRequestBindingFixture, bindingInput, clone,
  TENANT_ID, ARTIFACT_DIGEST, SECURITY_CONTEXT} from
  './request-binding-service-definition-fixture.js';

function createCache(gateway) {
  const listeners = new Set();
  return {
    filter(tableName, predicate) {
      return [...gateway.rows(tableName).values()].filter(predicate);
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    emit(tableName) {
      for (const listener of listeners) listener(tableName, 'INSERT', {});
    },
  };
}

function makeFakeRebalancer(record, options) {
  const rebalancer = {
    options,
    initialize() {},
    setLeader() {},
    enqueueRebalanceCheck() {
      return true;
    },
    shutdown() {},
  };
  record.push(rebalancer);
  return rebalancer;
}

function createPlanner(fixture) {
  const cache = createCache(fixture.gateway);
  const rebalancers = [];
  const owner = new RuntimeServiceRebalancerOwner({
    nodeId: 'node-1',
    systemTableCache: cache,
    cdcIntegrationService: {sqlQueryEngine: {}},
    tablePolicyService: {},
    messageRouter: {},
    rebalanceCoordinator: {},
    serviceDefinitionsOwner: fixture.owners.serviceDefinitionsOwner,
    createRebalancer: (options) =>
      makeFakeRebalancer(rebalancers, options),
  });
  return {cache, owner, rebalancers};
}

function assertConflict(error) {
  assert.ok(error instanceof RequestBindingServiceDefinitionError);
  assert.equal(
    error.code,
    REQUEST_BINDING_SERVICE_DEFINITION_ERROR_CODE.DESIRED_SERVICE_CONFLICT,
  );
  return true;
}

describe('request Binding desired-service compilation owner', () => {
  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
  });

  test('the compiler source set includes all seven Binding source kinds',
    () => {
      assert.equal(
        supportsBindingServiceDefinitionSourceKind('request'), true,
      );
      assert.equal(supportsBindingServiceDefinitionSourceKind('change'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('time'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('once'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('boot'), true);
      assert.equal(supportsBindingServiceDefinitionSourceKind('call'), true);
      assert.equal(
        supportsBindingServiceDefinitionSourceKind('pushdown'),
        true,
      );
    });

  test('the planning leader activates the complete pinned projection without ' +
    'declaring replica intent and admits one placement owner', async () => {
    const fixture = await createRequestBindingFixture();
    fixture.gateway.writes.length = 0;
    const planner = createPlanner(fixture);

    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    planner.cache.emit(TABLES.SERVICE_DEFINITIONS);
    await planner.owner.waitForBindingRefresh();

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    const row = fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).get(serviceId);
    assert.ok(row, 'the request Binding produced one desired service row');
    assert.equal(row[SD_COL.BINDING_VERSION_ID], fixture.binding.bindingVersionId);
    assert.equal(row[SD_COL.BINDING_DIGEST], fixture.bindingRow.binding_digest);
    assert.equal(row[SD_COL.STATUS], 'active');
    assert.equal(row[SD_COL.REPLICA_COUNT], 0);
    assert.equal(row[SD_COL.RUNTIME_KIND], 'oci_container');
    assert.equal(
      row[SD_COL.RUNTIME_REF],
      `registry.example.test/acme/orders:1.0.0@${ARTIFACT_DIGEST}`,
    );
    assert.deepEqual(JSON.parse(row[SD_COL.RUNTIME_CONFIG]), {
      entrypoint: 'server',
      export_name: 'request-handler',
      runtime_options: {memoryLimitMb: 128, networkPolicy: 'isolated'},
    });
    assert.deepEqual(
      JSON.parse(row[SD_COL.RESOURCE_BUDGET]),
      bindingInput(fixture.package_).budgets,
    );
    const projection = JSON.parse(row[SD_COL.BINDING_PROJECTION]);
    assert.equal(projection.binding_version_id, fixture.binding.bindingVersionId);
    assert.equal(projection.tenant_id, TENANT_ID);
    assert.deepEqual(
      projection.declaration.source,
      {kind: 'request', method: 'POST', path: '/orders'},
    );
    assert.equal(Object.hasOwn(projection.declaration, 'contexts'), false);
    assert.deepEqual(
      projection.declaration.capabilities,
      ['clock.read', 'network.client'],
    );
    assert.equal(Object.hasOwn(projection.declaration, 'elasticity'), false);
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.operation),
      ['insert', 'update'],
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICES).size, 0);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_ENDPOINTS).size, 0);
    assert.equal(planner.rebalancers.length, 1);
    assert.equal(planner.rebalancers[0].options.entityId, serviceId);
    assert.equal(planner.rebalancers[0].options.entityType, 'runtime_service');
    planner.owner.shutdown();
  });

  test('an existing inactive compiled request row advances with one owner update',
    async () => {
      const fixture = await createRequestBindingFixture();
      const artifact = await fixture.owners.serviceInstallCatalogOwner
        .getBindableArtifactForTenant(
          fixture.bindingRow.package_id,
          fixture.bindingRow.manifest_digest,
          TENANT_ID,
        );
      const compiled = buildRequestBindingServiceDefinition(
        fixture.bindingRow, artifact,
      );
      fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).set(
        compiled.service_id, clone(compiled),
      );
      const planner = createPlanner(fixture);

      planner.owner.setLeader(true);
      await planner.owner.waitForBindingRefresh();

      const row = fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS)
        .get(compiled.service_id);
      assert.equal(row[SD_COL.STATUS], 'active');
      assert.equal(row[SD_COL.REPLICA_COUNT], 0);
      assert.deepEqual(
        fixture.gateway.writes
          .filter((write) =>
            write.tableName === TABLES.SERVICE_DEFINITIONS)
          .map((write) => write.operation),
        ['update'],
      );
      assert.equal(planner.rebalancers.length, 1);
      planner.owner.shutdown();
    });

  test('CDC wake, replay, and leadership reacquisition are stable and repair ' +
    'a missing derived row', async () => {
    const fixture = await createRequestBindingFixture();
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    fixture.gateway.writes.length = 0;

    planner.cache.emit(TABLES.SERVICE_BINDINGS);
    await planner.owner.waitForBindingRefresh();
    planner.owner.setLeader(false);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.writes.length, 0, 'stable replay does not write');

    const nextInput = bindingInput(fixture.package_, {
      name: 'orders-status',
      source: {kind: 'request', method: 'GET', path: '/orders/status'},
    });
    await fixture.owners.deploymentBindingOwner.createBinding(
      nextInput, SECURITY_CONTEXT,
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1,
      'declaration persistence alone does not compile synchronously');
    fixture.gateway.writes.length = 0;
    planner.cache.emit(TABLES.SERVICE_BINDINGS);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 2,
      'the replicated Binding cache wake compiles the new declaration');
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.operation),
      ['insert', 'update'],
    );
    fixture.gateway.writes.length = 0;

    const serviceId = deriveRequestServiceDefinitionId(
      fixture.binding.bindingVersionId,
    );
    planner.owner.setLeader(false);
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).delete(serviceId);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.writes.length, 2,
      'leader scan repairs and reactivates absence');
    assert.ok(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).has(serviceId));
    planner.owner.shutdown();
  });

  test('lost insert responses recover by authoritative replay', async () => {
    const fixture = await createRequestBindingFixture({loseDesiredInsertResponse: true});
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
    assert.equal(planner.rebalancers.length, 1);
    planner.owner.shutdown();
  });

  test('lost activation responses recover by authoritative replay', async () => {
    const fixture = await createRequestBindingFixture({loseActivationUpdateResponse: true});
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    const row = [...fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).values()][0];
    assert.equal(row[SD_COL.STATUS], 'active');
    assert.equal(row[SD_COL.REPLICA_COUNT], 0);
    assert.equal(planner.rebalancers.length, 1);
    planner.owner.shutdown();
  });

  test('the declaration owner exposes no generic row-mutation API', async () => {
    const fixture = await createRequestBindingFixture();
    for (const methodName of [
      'insertRow',
      'upsertRow',
      'updateByPrimaryKey',
      'deleteByPrimaryKey',
    ]) {
      assert.equal(
        typeof fixture.owners.serviceDefinitionsOwner[methodName],
        'undefined',
        `${methodName} is not a public declaration bypass`,
      );
    }
  });

  test('conflicting derived state fails closed and cannot activate', async () => {
    const fixture = await createRequestBindingFixture();
    const artifact = await fixture.owners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        fixture.bindingRow.package_id,
        fixture.bindingRow.manifest_digest,
        TENANT_ID,
      );
    const expected = buildRequestBindingServiceDefinition(
      fixture.bindingRow, artifact,
    );
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).set(
      expected.service_id,
      {...expected, binding_version_id: null, status: 'active'},
    );

    await assert.rejects(
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      assertConflict,
    );
    const planner = createPlanner(fixture);
    planner.owner.setLeader(true);
    await planner.owner.waitForBindingRefresh();
    assert.equal(planner.rebalancers.length, 0,
      'partial Binding lineage remains ineligible for runtime placement');
    planner.owner.shutdown();
  });

  test('alternate service IDs cannot duplicate one Binding lineage', async () => {
    const fixture = await createRequestBindingFixture();
    const artifact = await fixture.owners.serviceInstallCatalogOwner
      .getBindableArtifactForTenant(
        fixture.bindingRow.package_id,
        fixture.bindingRow.manifest_digest,
        TENANT_ID,
      );
    const expected = buildRequestBindingServiceDefinition(
      fixture.bindingRow, artifact,
    );
    fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).set(
      'conflicting-service-id',
      {
        ...expected,
        service_id: 'conflicting-service-id',
        service_name: 'conflicting-service-id',
      },
    );
    fixture.gateway.writes.length = 0;

    await assert.rejects(
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      assertConflict,
    );
    assert.equal(fixture.gateway.writes.length, 0);
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
  });

  test('malformed request declaration state is ignored without a partial row',
    async () => {
      const fixture = await createRequestBindingFixture();
      const malformed = {
        ...fixture.bindingRow,
        binding_version_id: `binding-version-${'f'.repeat(64)}`,
      };
      fixture.gateway.rows(TABLES.SERVICE_BINDINGS).clear();
      fixture.gateway.rows(TABLES.SERVICE_BINDINGS).set(
        malformed.binding_version_id, malformed,
      );
      const planner = createPlanner(fixture);
      planner.owner.setLeader(true);
      await planner.owner.waitForBindingRefresh();
      assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 0);
      assert.equal(planner.rebalancers.length, 0);
      planner.owner.shutdown();
    });

  test('concurrent owner replay inserts one deterministic row', async () => {
    const fixture = await createRequestBindingFixture();
    fixture.gateway.writes.length = 0;
    const results = await Promise.all([
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.deepEqual(
      fixture.gateway.writes.map((write) => write.operation),
      ['insert', 'update'],
    );
    assert.equal(fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 1);
  });

  test('overlapping planning-owner instances converge through insert and ' +
    'activation races', async () => {
    const fixture = await createRequestBindingFixture();
    const peerOwners = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: fixture.gateway,
      now: () => 1000,
    });
    fixture.gateway.writes.length = 0;

    const results = await Promise.all([
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      peerOwners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
    ]);

    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(
      fixture.gateway.writes.filter((write) =>
        write.operation === 'insert').length,
      1,
    );
    const row = [...fixture.gateway.rows(TABLES.SERVICE_DEFINITIONS).values()][0];
    assert.equal(row[SD_COL.STATUS], 'active');
    assert.equal(row[SD_COL.REPLICA_COUNT], 0);

    fixture.gateway.writes.length = 0;
    await Promise.all([
      fixture.owners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
      peerOwners.serviceDefinitionsOwner.reconcileRequestBinding(
        fixture.bindingRow,
      ),
    ]);
    assert.equal(fixture.gateway.writes.length, 0);
  });
});
