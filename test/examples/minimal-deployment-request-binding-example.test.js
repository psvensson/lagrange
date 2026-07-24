import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import {describe, it} from 'node:test';

import {
  buildAccessPayload,
  buildBindingPayload,
  buildInstallPayload,
  buildManifest,
  EXAMPLE,
} from '../../examples/request-binding-deployment/request-binding-example-contract.js';

const EXAMPLE_ROOT = new URL(
  '../../examples/request-binding-deployment/',
  import.meta.url,
);
const PACKAGE_ID = `service-package-${'a'.repeat(64)}`;
const OCI_DIGEST = `sha256:${'b'.repeat(64)}`;

async function readExample(relativePath) {
  return readFile(new URL(relativePath, EXAMPLE_ROOT), 'utf8');
}

function fixtureReceipt() {
  return {
    layoutPath: '/tmp/request-binding-example-oci-layout',
    topManifestDescriptor: {
      digest: OCI_DIGEST,
      sizeBytes: 1234,
    },
  };
}

describe('minimal deployment request Binding example contract', () => {
  it('commits component source and a reproducible source-to-OCI build', async () => {
    const component = await readExample('component.wat');
    const contract = await readExample('request-binding-example-contract.js');

    assert.match(component, /^\(component/u);
    assert.match(component, /import "lagrange:cell\/context"/u);
    assert.match(component, /export "run"/u);
    assert.match(contract, /WASM_TOOLS_COMMAND: 'wasm-tools'/u);
    assert.match(contract, /WASM_TOOLS_PARSE: 'parse'/u);
    assert.match(contract, /ServiceLocalOciLayoutBuilder/u);
    await assert.rejects(
      access(new URL('component.wasm', EXAMPLE_ROOT)),
      (error) => error.code === 'ENOENT',
    );
  });

  it('pins one immutable request Binding and declares table authority', () => {
    const receipt = fixtureReceipt();
    const manifest = buildManifest(receipt);
    const install = buildInstallPayload(manifest, receipt);
    const binding = buildBindingPayload(PACKAGE_ID, manifest);
    const accessPayload = buildAccessPayload();

    assert.equal(install.artifact_source.kind, 'local_oci_layout');
    assert.equal(install.artifact_source.location, receipt.layoutPath);
    assert.equal(binding.schema_version, 2);
    assert.deepEqual(binding.source, {
      kind: 'request',
      method: EXAMPLE.METHOD,
      path: EXAMPLE.PATH,
    });
    assert.equal(binding.target.package_id, PACKAGE_ID);
    assert.match(binding.target.manifest_digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(binding.target.export_name, EXAMPLE.COMPONENT_EXPORT);
    assert.deepEqual(accessPayload.tables, [{
      operations: ['read', 'write'],
      slot: 0,
      table: EXAMPLE.DECLARED_TABLE,
    }]);
  });

  it('documents and checks the live matched, denied, and unmatched paths',
    async () => {
      const readme = await readExample('README.md');
      const runner = await readExample(
        'run-request-binding-deployment.js',
      );

      assert.match(
        readme,
        /node examples\/request-binding-deployment\/run-request-binding-deployment\.js/u,
      );
      assert.match(readme, /invoked: false/u);
      assert.match(runner, /'INSTALL SERVICE \$1'/u);
      assert.match(runner, /'CREATE BINDING \$1'/u);
      assert.match(runner, /'CONFIGURE SERVICE ACCESS \$1'/u);
      assert.match(runner, /HTTP_STATUS_ACCEPTED = 202/u);
      assert.match(runner, /matched\.status, HTTP_STATUS_ACCEPTED/u);
      assert.match(runner, /table slot 1/u);
      assert.match(runner, /unmatched\.body\.invoked, false/u);
      assert.match(
        runner,
        /unmatchedInvocationCount = Number\(unmatched\.body\.invoked\)/u,
      );
      assert.match(runner, /unmatchedInvocationCount,\n/u);
    });
});
