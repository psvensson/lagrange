import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {describe, it} from 'node:test';

import {
  buildBindingPayload,
  buildManifest,
} from '../../examples/request-binding-deployment/request-binding-example-contract.js';
import {
  BUILD,
  JS_EXAMPLE,
  buildJsAccessPayload,
} from '../../examples/js-request-binding-deployment/js-request-binding-example-contract.js';

const EXAMPLE_ROOT = new URL(
  '../../examples/js-request-binding-deployment/',
  import.meta.url,
);
const PACKAGE_ID = `service-package-${'a'.repeat(64)}`;
const OCI_DIGEST = `sha256:${'b'.repeat(64)}`;

async function readExample(relativePath) {
  return readFile(new URL(relativePath, EXAMPLE_ROOT), 'utf8');
}

function fixtureReceipt() {
  return {
    layoutPath: '/tmp/js-request-binding-example-oci-layout',
    topManifestDescriptor: {
      digest: OCI_DIGEST,
      sizeBytes: 1234,
    },
  };
}

describe('JavaScript request Binding example contract', () => {
  it('commits JavaScript source, a WIT world, and a ComponentizeJS build',
    async () => {
      const source = await readExample('service.js');
      const world = await readExample('wit/world.wit');
      const contract = await readExample(
        'js-request-binding-example-contract.js',
      );

      assert.match(source, /from 'lagrange:cell\/context'/u);
      assert.match(source, /export function run\(request\)/u);
      assert.match(world, /package lagrange:cell;/u);
      assert.match(world, /interface context \{/u);
      assert.match(world, /export run: func\(request: string\) -> string;/u);
      assert.match(contract, /componentize\(source, \{/u);
      assert.match(contract, /ServiceLocalOciLayoutBuilder/u);
      await assert.rejects(
        access(new URL('component.wasm', EXAMPLE_ROOT)),
        (error) => error.code === 'ENOENT',
      );
    });

  it('disables every engine capability except the cell context', () => {
    assert.deepEqual(
      [...BUILD.DISABLED_ENGINE_FEATURES].sort(),
      ['clocks', 'fetch-event', 'http', 'random', 'stdio'],
    );
  });

  it('pins one immutable request Binding and declares table authority', () => {
    const receipt = fixtureReceipt();
    const manifest = buildManifest(receipt, JS_EXAMPLE);
    const binding = buildBindingPayload(PACKAGE_ID, manifest, JS_EXAMPLE);
    const accessPayload = buildJsAccessPayload();

    assert.equal(manifest.name, JS_EXAMPLE.SERVICE_NAME);
    assert.equal(manifest.runtime.kind, 'wasm_component');
    assert.equal(binding.schema_version, 2);
    assert.deepEqual(binding.source, {
      kind: 'request',
      method: JS_EXAMPLE.METHOD,
      path: JS_EXAMPLE.PATH,
    });
    assert.equal(binding.target.package_id, PACKAGE_ID);
    assert.match(binding.target.manifest_digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(binding.target.export_name, JS_EXAMPLE.COMPONENT_EXPORT);
    assert.deepEqual(accessPayload.tables, [{
      operations: ['read', 'write'],
      slot: 0,
      table: JS_EXAMPLE.DECLARED_TABLE,
    }]);
  });

  it('documents and checks the ledger and denied paths', async () => {
    const readme = await readExample('README.md');
    const runner = await readExample('run-js-request-binding-deployment.js');

    assert.match(
      readme,
      /node examples\/js-request-binding-deployment\/run-js-request-binding-deployment\.js/u,
    );
    assert.match(readme, /ComponentizeJS/u);
    assert.match(runner, /'INSTALL SERVICE \$1'/u);
    assert.match(runner, /'CREATE BINDING \$1'/u);
    assert.match(runner, /'CONFIGURE SERVICE ACCESS \$1'/u);
    assert.match(runner, /HTTP_STATUS_ACCEPTED = 202/u);
    assert.match(runner, /first\.status, HTTP_STATUS_ACCEPTED/u);
    assert.match(runner, /stored 15 at key 2/u);
    assert.match(runner, /table slot 1/u);
  });
});
