import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const COMMAND_OWNER_SOURCE =
  'src/service/service-lifecycle-command-owner.js';
const CATALOG_CONTRACT_SOURCE =
  'src/control-plane/owners/service-install-catalog-contract.js';
const SCAFFOLD_SOURCE = 'src/cli/service-project-scaffold.js';

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return source.slice(start, end);
}

test('artifact declarations retain one validation-to-catalog owner path', () => {
  const commandOwner = fs.readFileSync(COMMAND_OWNER_SOURCE, 'utf8');
  const catalogContract = fs.readFileSync(CATALOG_CONTRACT_SOURCE, 'utf8');
  const scaffold = fs.readFileSync(SCAFFOLD_SOURCE, 'utf8');
  const submission = between(
    commandOwner,
    'async submitArtifactIntent(',
    'async submitRemovalIntent(',
  );
  const normalization = submission.indexOf('this.normalizeManifest(payload)');
  const resolution = submission.indexOf('this.resolveArtifact(');
  const persistence = submission.indexOf('this.catalogOwner.recordPackage({');

  assert.match(
    commandOwner,
    /import \{normalizeExternalServiceManifest\} from/u,
  );
  assert.ok(normalization >= 0 && normalization < resolution);
  assert.ok(resolution < persistence);
  assert.match(
    catalogContract,
    /normalized_manifest: canonicalJson\(\s*manifest,/u,
  );
  assert.match(scaffold, /validateExternalServiceManifest\(manifest\)/u);
});
