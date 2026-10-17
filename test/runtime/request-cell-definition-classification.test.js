// The request-Cell classifier at its owner (request-cell-runtime-contract.js;
// design ACTIVATION-DISCOVERY-DESIGN-20261017 stage 1c, finding F-3): a
// serialized service_definitions row carries the binding_* columns for every
// definition, null for a non-Cell. Presence of a key is not lineage.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isRequestCellDefinition} from '../../src/runtime/request-cell-runtime-contract.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';

const NOW = 1000;
const PACKAGE = Object.freeze({serviceId: 'installed-package', serviceName: 'installed-package',
  handlerFunctionId: 'handler', runtimeKind: 'wasm_component',
  runtimeRef: 'fixture/component@1.0.0', runtimeConfig: '{}'});

test('a serialized installed-package row (binding_* keys present, null) is not a request Cell',
  () => {
    const row = serializeServiceDefinition(PACKAGE, NOW);
    for (const key of ['binding_version_id', 'binding_digest', 'binding_projection']) {
      assert.ok(Object.hasOwn(row, key), `the serialized row carries ${key}`);
      assert.equal(row[key], null);
    }
    assert.equal(isRequestCellDefinition(row), false);
    assert.equal(isRequestCellDefinition({...PACKAGE}), false, 'keys absent: not a Cell');
  });

test('a serialized compiled Cell row (binding lineage values) is a request Cell', () => {
  const row = serializeServiceDefinition({...PACKAGE, serviceId: 'req-cell',
    bindingVersionId: 'binding-version-1', bindingDigest: `sha256:${'b'.repeat(64)}`,
    bindingProjection: '{"binding_version_id":"binding-version-1"}'}, NOW);
  assert.equal(isRequestCellDefinition(row), true);
  for (const key of ['binding_version_id', 'binding_digest', 'binding_projection']) {
    assert.equal(isRequestCellDefinition({...PACKAGE, [key]: row[key]}), true,
      `${key} alone carries Cell lineage`);
  }
});
