import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const CATALOG_OWNER_SOURCE =
  'src/control-plane/owners/service-install-catalog-owner.js';
const CATALOG_CONTRACT_SOURCE =
  'src/control-plane/owners/service-install-catalog-contract.js';
const PACKAGE_SCHEMA_SOURCE =
  'src/bootstrap/system-table-runtime-schema-definitions.js';

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test('bindable artifact identity remains catalog-owned and schema-compatible',
  () => {
    const owner = fs.readFileSync(CATALOG_OWNER_SOURCE, 'utf8');
    const contract = fs.readFileSync(CATALOG_CONTRACT_SOURCE, 'utf8');
    const schemas = fs.readFileSync(PACKAGE_SCHEMA_SOURCE, 'utf8');
    const packageSchema = between(
      schemas,
      'const SERVICE_PACKAGES_SCHEMA = {',
      'const SERVICE_REVISIONS_SCHEMA = {',
    );

    assert.match(owner, /async getBindableArtifact\(packageId, manifestDigest\)/u);
    assert.match(owner, /async resolveUniqueBindableArtifactByDigest/u);
    assert.match(
      contract,
      /manifestDigest: sha256Json\(parsed\.canonical\)/u,
    );
    assert.match(
      contract,
      /canonical !== row\.normalized_manifest/u,
    );
    assert.doesNotMatch(packageSchema, /manifest_digest/u);
    assert.doesNotMatch(owner, /serviceDefinitionsOwner/u);
  });
