import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
  isDeploymentBindingCellSourceKind,
} from '../../src/control-plane/owners/deployment-binding-contract.js';

const SOURCE = Object.freeze({
  bindingDeclaration: readFileSync(
    'src/control-plane/owners/deployment-binding-contract.js', 'utf8',
  ),
  bindingContract: readFileSync(
    'src/control-plane/owners/request-binding-service-definition-contract.js',
    'utf8',
  ),
  definitionsOwner: readFileSync(
    'src/control-plane/owners/service-definitions-owner.js', 'utf8',
  ),
  metaActions: readFileSync('src/constants/wasm-meta.js', 'utf8'),
  metaHandlers: readFileSync(
    'src/wasm-service/meta-command-handlers.js', 'utf8',
  ),
  planner: readFileSync(
    'src/bootstrap/shared/runtime-service-rebalancer-setup.js', 'utf8',
  ),
  runtimePolicy: readFileSync(
    'src/rebalancer/runtime-service-policy.js', 'utf8',
  ),
  seedPhase: readFileSync(
    'src/bootstrap/phases/seed-registration-phase.js', 'utf8',
  ),
});

test('Binding owns user desired-service declaration and the existing planner ' +
  'owns compilation', () => {
  assert.match(SOURCE.planner, /SYSTEM_TABLE_NAME\.SERVICE_BINDINGS/u);
  assert.match(SOURCE.planner, /reconcileRequestBinding/u);
  assert.match(SOURCE.planner, /serviceDefinitionsOwner/u);
  assert.match(SOURCE.definitionsOwner, /buildRequestBindingServiceDefinition/u);
  assert.match(SOURCE.definitionsOwner, /insertRow\(compiled/u);
  assert.doesNotMatch(
    SOURCE.definitionsOwner,
    /class ServiceDefinitionsOwner extends SystemMetadataOwnerBase/u,
  );
  assert.doesNotMatch(
    SOURCE.definitionsOwner,
    /insertServiceDefinition|upsertServiceDefinition|updateServiceDefinition|removeServiceDefinition/u,
  );
});

test('Binding Cell placement keeps compilation two-phase and owner-controlled',
  () => {
    assert.match(
      SOURCE.bindingContract,
      /\[SD_COL\.REPLICA_COUNT\]: 0/u,
    );
    assert.match(
      SOURCE.bindingContract,
      /WASM_SERVICE_DEFINITION_STATUS\.INACTIVE/u,
    );
    assert.match(SOURCE.bindingContract, /SD_COL\.BINDING_VERSION_ID/u);
    assert.match(SOURCE.bindingContract, /SD_COL\.BINDING_PROJECTION/u);
    assert.match(
      SOURCE.definitionsOwner,
      /buildActivatedRequestBindingServiceDefinition/u,
    );
    assert.match(
      SOURCE.definitionsOwner,
      /activateBindingServiceDefinition/u,
    );
    assert.match(
      SOURCE.planner,
      /hasRequestBindingServiceDefinitionLineage/u,
    );
    assert.match(
      SOURCE.planner,
      /getBindingServiceDefinitionSourceKind/u,
    );
    assert.match(
      SOURCE.planner,
      /isDeploymentBindingCellSourceKind/u,
    );
    assert.match(
      SOURCE.bindingContract,
      /DEPLOYMENT_BINDING_SOURCE_KIND\.CHANGE/u,
    );
    assert.match(
      SOURCE.bindingContract,
      /DEPLOYMENT_BINDING_SOURCE_KIND\.REQUEST/u,
    );
    assert.match(
      SOURCE.bindingContract,
      /DEPLOYMENT_BINDING_SOURCE_KIND\.TIME/u,
    );
    assert.equal(
      isDeploymentBindingCellSourceKind(
        DEPLOYMENT_BINDING_SOURCE_KIND.BOOT,
      ),
      true,
    );
    assert.equal(
      isDeploymentBindingCellSourceKind(
        DEPLOYMENT_BINDING_SOURCE_KIND.ONCE,
      ),
      true,
    );
    for (const inactiveSourceKind of [
      DEPLOYMENT_BINDING_SOURCE_KIND.CALL,
      DEPLOYMENT_BINDING_SOURCE_KIND.PUSHDOWN,
    ]) {
      assert.equal(
        isDeploymentBindingCellSourceKind(inactiveSourceKind),
        false,
      );
    }
  });

test('Binding Cells leave replica targets to the existing runtime policy', () => {
  assert.doesNotMatch(
    SOURCE.bindingDeclaration,
    /elasticity|min_learners|max_learners|voters/u,
  );
  assert.doesNotMatch(
    SOURCE.bindingContract,
    /binding\.declaration\.elasticity/u,
  );
  assert.doesNotMatch(
    SOURCE.bindingDeclaration,
    /normalizeLegacy|LEGACY_/u,
  );
  assert.doesNotMatch(
    SOURCE.bindingContract,
    /buildLegacy|LEGACY_/u,
  );
  assert.match(
    SOURCE.runtimePolicy,
    /REBALANCER_DEFAULT_POLICY\.RUNTIME_SERVICE\.targetReplicaCount/u,
  );
  assert.match(
    SOURCE.runtimePolicy,
    /hasRequestBindingServiceDefinitionLineage/u,
  );
});

test('legacy user service-definition mutation ingress is absent while axiomatic ' +
  'built-ins remain', () => {
  const retiredHandlers =
    /handleCreateService|handleUpdateService|handleScaleService|handleDeleteService/u;
  const retiredActions =
    /CREATE_SERVICE|UPDATE_SERVICE|SCALE_SERVICE|ROLLOUT_SERVICE|DELETE_SERVICE/u;
  assert.doesNotMatch(SOURCE.metaHandlers, retiredHandlers);
  assert.doesNotMatch(SOURCE.metaHandlers, /SERVICE_DEFINITIONS/u);
  assert.doesNotMatch(SOURCE.metaActions, retiredActions);
  assert.match(SOURCE.seedPhase, /registerBuiltInMetaServiceDefinitions/u);
});
