import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const SOURCE = Object.freeze({
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

test('request Cell placement keeps compilation two-phase and owner-controlled',
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
      /activateRequestServiceDefinition/u,
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
      /DEPLOYMENT_BINDING_SOURCE_KIND\.REQUEST/u,
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
