import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const BINDING_OWNER_SOURCE =
  'src/control-plane/owners/deployment-binding-owner.js';
const BINDING_CONTRACT_SOURCE =
  'src/control-plane/owners/deployment-binding-contract.js';
const LIFECYCLE_OWNER_SOURCE =
  'src/service/service-lifecycle-command-owner.js';
const TABLE_SCHEMA_SOURCE =
  'src/bootstrap/system-table-runtime-schema-definitions.js';

function sourceFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true})
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && path.endsWith('.js') ? [path] : [];
    });
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test('Binding v0 retains one immutable declaration owner and no runtime write',
  () => {
    const owner = fs.readFileSync(BINDING_OWNER_SOURCE, 'utf8');
    const contract = fs.readFileSync(BINDING_CONTRACT_SOURCE, 'utf8');
    const lifecycle = fs.readFileSync(LIFECYCLE_OWNER_SOURCE, 'utf8');
    const schemas = fs.readFileSync(TABLE_SCHEMA_SOURCE, 'utf8');
    const allSource = sourceFiles('src')
      .map((path) => fs.readFileSync(path, 'utf8'))
      .join('\n');
    const bindingSchema = between(
      schemas,
      'const SERVICE_BINDINGS_SCHEMA = {',
      'const SERVICE_PACKAGES_SCHEMA = {',
    );

    assert.match(owner, /class DeploymentBindingOwner extends/u);
    assert.match(owner, /async createBinding\(/u);
    assert.match(owner, /this\.catalogOwner\.getBindableArtifactForTenant\(/u);
    assert.match(owner, /await this\.insertRow\(row, options\)/u);
    assert.doesNotMatch(owner, /updateByPrimaryKey|deleteByPrimaryKey/u);
    assert.doesNotMatch(owner, /serviceDefinitionsOwner|SERVICE_DEFINITIONS/u);
    assert.match(lifecycle, /this\.bindingOwner\.createBinding\(/u);
    assert.match(contract, /DEPLOYMENT_BINDING_SOURCE_INTERFACE/u);
    assert.equal(
      allSource.match(/class DeploymentBindingOwner\b/gu)?.length,
      1,
    );
    assert.equal(allSource.match(/async createBinding\(/gu)?.length, 1);
    assert.doesNotMatch(
      allSource,
      /insertSystemTableRow\([^)]*SERVICE_BINDINGS/su,
    );
    assert.doesNotMatch(bindingSchema,
      /name: '(?:active|endpoint|health|node_id|replica_id|running|status|updated_at)'/u);
  });
